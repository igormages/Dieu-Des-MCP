import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSign, createHash } from "crypto";

type Keys = Record<string, string>;

// ── Anthropic ─────────────────────────────────────────────────────────────
async function testAnthropic(keys: Keys) {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": keys.apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Clé API Anthropic invalide (${res.status})`);
  }
}

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

// ── Feedly ─────────────────────────────────────────────────────────────────
async function testFeedly(keys: Keys) {
  const res = await fetch("https://cloud.feedly.com/v3/profile", {
    headers: { Authorization: `Bearer ${keys.accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { errorMessage?: string }).errorMessage ?? `Token Feedly invalide (${res.status})`);
  }
}

// ── ElevenLabs ─────────────────────────────────────────────────────────────
async function testCoditVentePres(keys: Keys) {
  const src = keys.presentationSource?.trim();
  if (!src) {
    throw new Error(
      "Indique une URL vers presentation.json ou le chemin du dossier commercial/ (ou CODIT_VENTEPRES_PRESENTATION_SOURCE sur le déploiement)."
    );
  }
}

async function testPennylaneCodit(keys: Keys) {
  const res = await fetch("https://app.pennylane.com/api/external/v2/me", {
    headers: {
      Authorization: `Bearer ${keys.apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { message?: string; error?: string }).message ?? (err as { error?: string }).error;
    throw new Error(msg ?? `Jeton Pennylane invalide (${res.status})`);
  }
}

async function testElevenLabs(keys: Keys) {
  const res = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: { "xi-api-key": keys.apiKey },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { detail?: { message?: string } | string }).detail;
    throw new Error(
      typeof msg === "string" ? msg : (msg as { message?: string })?.message ?? `Clé ElevenLabs invalide (${res.status})`
    );
  }
}

// ── Registry ───────────────────────────────────────────────────────────────
const TESTERS: Record<string, (keys: Keys) => Promise<void>> = {
  anthropic: testAnthropic,
  microsoft: testMicrosoft,
  apple: testApple,
  googlecloud: testGoogleCloud,
  openai: testOpenAI,
  vercel: testVercel,
  ovh: testOvh,
  scaleway: testScaleway,
  hostinger: testHostinger,
  webflow: testWebflow,
  github: testGitHub,
  qonto: testQonto,
  feedly: testFeedly,
  elevenlabs: testElevenLabs,
  pennylaneCodit: testPennylaneCodit,
  coditVentePres: testCoditVentePres,
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
