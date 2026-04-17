import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSign, createHmac, createHash } from "crypto";

type Keys = Record<string, string>;

// ── Microsoft ──────────────────────────────────────────────────────────────
async function testMicrosoft(keys: Keys) {
  const res = await fetch(
    `https://login.microsoftonline.com/${keys.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: keys.clientId,
        client_secret: keys.clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }).toString(),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description ?? "Token invalide");
}

// ── Apple ──────────────────────────────────────────────────────────────────
async function testApple(keys: Keys) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keys.keyId, typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: keys.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })).toString("base64url");
  const sign = createSign("SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign({ key: keys.privateKey.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  const token = `${header}.${payload}.${sig}`;

  const res = await fetch("https://api.appstoreconnect.apple.com/v1/apps?limit=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.detail ?? `Erreur ${res.status}`);
  }
}

// ── AWS ────────────────────────────────────────────────────────────────────
async function testAws(keys: Keys) {
  const region = "us-east-1";
  const host = "ce.us-east-1.amazonaws.com";
  const now = new Date();
  const dateTime = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const date = dateTime.slice(0, 8);
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const body = JSON.stringify({ TimePeriod: { Start: start, End: end }, Granularity: "MONTHLY", Metrics: ["UnblendedCost"] });
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${dateTime}\nx-amz-target:AmazonCEService.GetCostAndUsage\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${date}/${region}/ce/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", dateTime, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const kDate = createHmac("sha256", `AWS4${keys.secretAccessKey}`).update(date).digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update("ce").digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${keys.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", Host: host, "X-Amz-Date": dateTime, "X-Amz-Target": "AmazonCEService.GetCostAndUsage", Authorization: authHeader },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Erreur ${res.status}`);
  }
}

// ── Google Cloud ───────────────────────────────────────────────────────────
async function testGoogleCloud(keys: Keys) {
  const privateKey = keys.privateKey.replace(/\\n/g, "\n");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: keys.clientEmail, scope: "https://www.googleapis.com/auth/cloud-billing.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now })).toString("base64url");
  const sign = createSign("SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKey).toString("base64url");
  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(tokenData.error_description ?? "Token invalide");

  const res = await fetch("https://cloudbilling.googleapis.com/v1/billingAccounts?pageSize=1", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}

// ── OpenAI ─────────────────────────────────────────────────────────────────
async function testOpenAI(keys: Keys) {
  const res = await fetch("https://api.openai.com/v1/models?limit=1", {
    headers: { Authorization: `Bearer ${keys.apiKey}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Erreur ${res.status}`);
  }
}

// ── Vercel ─────────────────────────────────────────────────────────────────
async function testVercel(keys: Keys) {
  const url = new URL("https://api.vercel.com/v2/user");
  if (keys.teamId) url.searchParams.set("teamId", keys.teamId);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${keys.apiToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Erreur ${res.status}`);
  }
}

// ── OVH ────────────────────────────────────────────────────────────────────
async function testOvh(keys: Keys) {
  const endpoints: Record<string, string> = {
    "ovh-eu": "https://eu.api.ovh.com/1.0",
    "ovh-us": "https://api.us.ovhcloud.com/1.0",
    "ovh-ca": "https://ca.api.ovh.com/1.0",
  };
  const base = endpoints[keys.endpoint ?? "ovh-eu"] ?? endpoints["ovh-eu"];
  const url = `${base}/me`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = "$1$" + createHash("sha1").update(`${keys.appSecret}+${keys.consumerKey}+GET+${url}++${timestamp}`).digest("hex");

  const res = await fetch(url, {
    headers: { "X-Ovh-Application": keys.appKey, "X-Ovh-Consumer": keys.consumerKey, "X-Ovh-Signature": sig, "X-Ovh-Timestamp": timestamp },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Erreur ${res.status}`);
  }
}

// ── Amazon ─────────────────────────────────────────────────────────────────
async function testAmazon(keys: Keys) {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: keys.clientId, client_secret: keys.clientSecret, refresh_token: keys.refreshToken }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description ?? "Token LWA invalide");
}

// ── Scaleway ───────────────────────────────────────────────────────────────
async function testScaleway(keys: Keys) {
  const res = await fetch(
    `https://api.scaleway.com/billing/v1alpha1/invoices?organization_id=${keys.organizationId}&page_size=1`,
    { headers: { "X-Auth-Token": keys.secretKey } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Erreur ${res.status}`);
  }
}

// ── Hostinger ──────────────────────────────────────────────────────────────
async function testHostinger(keys: Keys) {
  const res = await fetch("https://api.hostinger.com/v1/billing/subscriptions?per_page=1", {
    headers: { Authorization: `Bearer ${keys.apiToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Erreur ${res.status}`);
  }
}

// ── Orange ─────────────────────────────────────────────────────────────────
async function testOrange(keys: Keys) {
  const creds = Buffer.from(`${keys.clientId}:${keys.clientSecret}`).toString("base64");
  const res = await fetch("https://api.orange.com/oauth/v3/token", {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description ?? "Token Orange invalide");
}

// ── Webflow ────────────────────────────────────────────────────────────────
async function testWebflow(keys: Keys) {
  const res = await fetch("https://api.webflow.com/v2/token/introspect", {
    headers: { Authorization: `Bearer ${keys.apiToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Erreur ${res.status}`);
  }
}

// ── Setapp/Paddle ──────────────────────────────────────────────────────────
async function testSetapp(keys: Keys) {
  const res = await fetch("https://vendors.paddle.com/api/2.0/user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vendor_id: keys.vendorId, vendor_auth_code: keys.vendorAuthCode }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error?.message ?? "Identifiants Paddle invalides");
}

// ── GitHub ─────────────────────────────────────────────────────────────────
async function testGitHub(keys: Keys) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${keys.personalAccessToken}`, "User-Agent": "mcp-aggregator" },
  });
  if (!res.ok) throw new Error(`Token GitHub invalide (${res.status})`);
}

// ── Qonto ──────────────────────────────────────────────────────────────────
async function testQonto(keys: Keys) {
  const res = await fetch(
    `https://thirdparty.qonto.com/v2/organizations/${keys.organizationSlug}`,
    { headers: { Authorization: `${keys.organizationSlug}:${keys.secretKey}` } }
  );
  if (!res.ok) throw new Error(`Identifiants Qonto invalides (${res.status})`);
}

// ── Registry ───────────────────────────────────────────────────────────────
const TESTERS: Record<string, (keys: Keys) => Promise<void>> = {
  microsoft: testMicrosoft,
  apple: testApple,
  aws: testAws,
  googlecloud: testGoogleCloud,
  openai: testOpenAI,
  vercel: testVercel,
  ovh: testOvh,
  amazon: testAmazon,
  scaleway: testScaleway,
  hostinger: testHostinger,
  orange: testOrange,
  webflow: testWebflow,
  setapp: testSetapp,
  github: testGitHub,
  qonto: testQonto,
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { service, keys } = (await request.json()) as { service: string; keys: Keys };

  const tester = TESTERS[service];
  if (!tester) return NextResponse.json({ ok: true, skipped: true });

  try {
    await tester(keys);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
