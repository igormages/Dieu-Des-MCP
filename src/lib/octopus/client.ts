import { getServiceKeys, getKvClient } from "@/lib/keys/store";
import {
  OCTOPUS_ORIGIN,
  type OctopusCagnotteStatus,
  type OctopusEligibleAgreement,
  type OctopusSessionStatus,
  type OctopusUseCagnotteResult,
} from "./types";

const SESSION_KEY = "octopus:session:default";
const SESSION_TTL_SECONDS = 60 * 60 * 4;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="149", "Not)A;Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

// HAR confirmé : POST /api/auth/login puis GET /api/auth/session
const LOGIN_PATH = "/api/auth/login";
const SESSION_PATH = "/api/auth/session";
const GRAPHQL_PATH = "/api/graphql/kraken";

// HAR confirmé : mutation CreateSourceFundRequest pour utiliser la cagnotte
const MUTATION_CREATE_SOURCE_FUND = `mutation CreateSourceFundRequest($input: CreateSourceFundRequestInput!) {
  createSourceFundRequest(input: $input) {
    sourceFundRequest {
      status
    }
  }
}`;

// Requête dérivée du queryKey DashboardPotPage dans le HAR (page cagnotte)
const QUERY_DASHBOARD_POT = `query DashboardPotPage($accountNumber: String!) {
  account(accountNumber: $accountNumber) {
    creditStorage {
      balanceForecast
      ledger {
        number
        currentBalance
      }
      sourceFundRequestEligibilities {
        globalEligibilityOutcome
        edges {
          node {
            ledgerNumber
            eligibilityOutcome
            expectedPaymentDate
          }
        }
      }
    }
    agreements(last: 20) {
      edges {
        node {
          id
          isActive
          billingFrequency
          chargingLedger {
            number
          }
          supplyPoint {
            marketName
            meterPoint {
              address {
                fullAddress
              }
            }
          }
          nextPaymentForecast {
            amount
            date
          }
        }
      }
    }
  }
}`;

const QUERY_VIEWER = `query Viewer {
  viewer {
    preferredName
    accounts {
      number
    }
  }
}`;

interface SessionState {
  cookies: Record<string, Record<string, string>>;
  expiresAt: number;
  loggedInAt: number;
  accountNumber: string | null;
}

interface OctopusCredentials {
  email: string;
  password: string;
  accountNumber?: string;
  browserCookies?: string;
}

class CookieJar {
  private store: Record<string, Record<string, string>> = {};

  constructor(initial?: Record<string, Record<string, string>>) {
    if (initial) this.store = initial;
  }

  toJSON(): Record<string, Record<string, string>> {
    return this.store;
  }

  merge(extra: Record<string, Record<string, string>>): void {
    for (const [host, jar] of Object.entries(extra)) {
      if (!this.store[host]) this.store[host] = {};
      Object.assign(this.store[host], jar);
    }
  }

  getCookieHeader(host: string): string {
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const [storeHost, jar] of Object.entries(this.store)) {
      if (host === storeHost || host.endsWith(`.${storeHost}`)) {
        for (const [name, value] of Object.entries(jar)) {
          if (seen.has(name)) continue;
          seen.add(name);
          parts.push(`${name}=${value}`);
        }
      }
    }
    return parts.join("; ");
  }

  ingest(host: string, response: Response): void {
    for (const raw of extractSetCookies(response.headers)) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      const cookieHost = (parsed.domain ?? host).replace(/^\./, "");
      if (!this.store[cookieHost]) this.store[cookieHost] = {};
      if (parsed.value === "" || parsed.expired) {
        delete this.store[cookieHost][parsed.name];
      } else {
        this.store[cookieHost][parsed.name] = parsed.value;
      }
    }
  }
}

function extractSetCookies(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const all: string[] = [];
  headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") all.push(value);
  });
  return all;
}

function parseSetCookie(raw: string): {
  name: string;
  value: string;
  domain?: string;
  expired: boolean;
} | null {
  const segments = raw.split(";").map((s) => s.trim());
  const [first] = segments;
  if (!first) return null;
  const eqIdx = first.indexOf("=");
  if (eqIdx === -1) return null;
  const name = first.slice(0, eqIdx).trim();
  const value = first.slice(eqIdx + 1).trim();
  let domain: string | undefined;
  let expired = false;
  for (const seg of segments.slice(1)) {
    const lower = seg.toLowerCase();
    if (lower.startsWith("domain=")) domain = seg.slice(7).trim().toLowerCase();
    else if (lower.startsWith("max-age=")) {
      const ma = parseInt(seg.slice(8), 10);
      if (!Number.isNaN(ma) && ma <= 0) expired = true;
    } else if (lower.startsWith("expires=")) {
      const date = new Date(seg.slice(8));
      if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) expired = true;
    }
  }
  return { name, value, domain, expired };
}

function hostOf(url: string): string {
  return new URL(url).host;
}

function parseBrowserCookies(raw: string): Record<string, Record<string, string>> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as Record<string, Record<string, string>>;
  }
  const jar: Record<string, Record<string, string>> = {
    "octopusenergy.fr": {},
  };
  for (const part of trimmed.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) jar["octopusenergy.fr"][name] = value;
  }
  return jar;
}

function isVercelCheckpoint(text: string, status: number): boolean {
  return (
    status === 429 ||
    text.includes("Vercel Security Checkpoint") ||
    text.includes("x-vercel-mitigated")
  );
}

function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

function eligibilityMessage(outcome: string, balanceCents: number): string {
  switch (outcome) {
    case "OK":
      return balanceCents > 0
        ? `Cagnotte utilisable : ${formatEuros(balanceCents)}.`
        : "Aucun solde disponible sur la cagnotte.";
    case "SOURCE_LEDGER_HAS_PENDING_FUND_REQUESTS":
      return "Une demande d'utilisation de la cagnotte est déjà en cours.";
    default:
      return `Cagnotte non utilisable (${outcome}).`;
  }
}

let memorySession: SessionState | null = null;
let inflightLogin: Promise<SessionState> | null = null;

async function getCredentials(): Promise<OctopusCredentials> {
  const keys = await getServiceKeys("octopus");
  const email =
    (typeof keys?.email === "string" && keys.email.trim()) ||
    process.env.OCTOPUS_EMAIL?.trim();
  const password =
    (typeof keys?.password === "string" && keys.password.trim()) ||
    process.env.OCTOPUS_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "Identifiants Octopus Energy non configurés. Enregistrez email et mot de passe sur /settings ou définissez OCTOPUS_EMAIL et OCTOPUS_PASSWORD."
    );
  }
  return {
    email,
    password,
    accountNumber:
      (typeof keys?.accountNumber === "string" && keys.accountNumber.trim()) ||
      process.env.OCTOPUS_ACCOUNT_NUMBER?.trim() ||
      undefined,
    browserCookies:
      (typeof keys?.browserCookies === "string" && keys.browserCookies.trim()) ||
      process.env.OCTOPUS_BROWSER_COOKIES?.trim() ||
      undefined,
  };
}

async function loadSession(): Promise<SessionState | null> {
  if (memorySession && memorySession.expiresAt > Date.now()) {
    return memorySession;
  }
  const kv = getKvClient();
  if (!kv) return null;
  const raw = await kv.get<SessionState>(SESSION_KEY);
  if (!raw || raw.expiresAt <= Date.now()) return null;
  memorySession = raw;
  return raw;
}

async function saveSession(state: SessionState): Promise<void> {
  memorySession = state;
  const kv = getKvClient();
  if (!kv) return;
  await kv.set(SESSION_KEY, state, { ex: SESSION_TTL_SECONDS });
}

async function clearSession(): Promise<void> {
  memorySession = null;
  const kv = getKvClient();
  if (kv) await kv.del(SESSION_KEY);
}

function buildJar(state?: SessionState, browserCookies?: string): CookieJar {
  const jar = new CookieJar(state?.cookies);
  if (browserCookies) {
    jar.merge(parseBrowserCookies(browserCookies));
  }
  return jar;
}

async function fetchWithJar(
  jar: CookieJar,
  url: string,
  init: RequestInit = {}
): Promise<{ response: Response; text: string }> {
  const headers = new Headers({
    ...COMMON_HEADERS,
    ...(init.headers as Record<string, string> | undefined),
  });
  const cookieHeader = jar.getCookieHeader(hostOf(url));
  if (cookieHeader) headers.set("cookie", cookieHeader);

  const response = await fetch(url, { ...init, headers });
  jar.ingest(hostOf(url), response);
  const text = await response.text();
  return { response, text };
}

async function readSession(jar: CookieJar): Promise<{
  isAuthenticated: boolean;
  authMethod: string | null;
  sub: string | null;
}> {
  const { response, text } = await fetchWithJar(jar, `${OCTOPUS_ORIGIN}${SESSION_PATH}`, {
    method: "GET",
    headers: { accept: "*/*", referer: `${OCTOPUS_ORIGIN}/espace-client` },
  });
  if (isVercelCheckpoint(text, response.status)) {
    throw new Error(
      "Octopus Energy bloque la requête (Vercel Security Checkpoint). Importez les cookies navigateur dans /settings (champ cookies navigateur) après connexion sur octopusenergy.fr."
    );
  }
  if (!response.ok) {
    throw new Error(`Octopus session ${response.status}: ${text.slice(0, 200)}`);
  }
  const body = JSON.parse(text) as {
    data?: { isAuthenticated?: boolean; authMethod?: string | null; sub?: string | null };
  };
  return {
    isAuthenticated: Boolean(body.data?.isAuthenticated),
    authMethod: body.data?.authMethod ?? null,
    sub: body.data?.sub ?? null,
  };
}

async function graphqlRequest<T>(
  jar: CookieJar,
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string,
  referer?: string
): Promise<T> {
  const { response, text } = await fetchWithJar(jar, `${OCTOPUS_ORIGIN}${GRAPHQL_PATH}`, {
    method: "POST",
    headers: {
      accept: "application/graphql-response+json, application/json",
      "content-type": "application/json",
      origin: OCTOPUS_ORIGIN,
      referer: referer ?? `${OCTOPUS_ORIGIN}/espace-client`,
      "x-error-policy": "none",
    },
    body: JSON.stringify({ query, variables, operationName }),
  });

  if (isVercelCheckpoint(text, response.status)) {
    throw new Error(
      "Octopus Energy bloque la requête GraphQL (Vercel Security Checkpoint). Importez les cookies navigateur dans /settings."
    );
  }
  if (!response.ok) {
    throw new Error(`Octopus GraphQL ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = JSON.parse(text) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new Error(`Octopus GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  if (!body.data) {
    throw new Error("Octopus GraphQL: réponse vide.");
  }
  return body.data;
}

async function performLogin(): Promise<SessionState> {
  const creds = await getCredentials();
  const jar = buildJar(undefined, creds.browserCookies);

  const { response, text } = await fetchWithJar(jar, `${OCTOPUS_ORIGIN}${LOGIN_PATH}`, {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      origin: OCTOPUS_ORIGIN,
      referer: `${OCTOPUS_ORIGIN}/connexion`,
    },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      nextPage: "/espace-client",
    }),
  });

  if (isVercelCheckpoint(text, response.status)) {
    throw new Error(
      "Connexion Octopus bloquée par Vercel. Connectez-vous dans le navigateur, exportez les cookies octopusenergy.fr et collez-les dans /settings (cookies navigateur), puis réessayez."
    );
  }
  if (!response.ok) {
    throw new Error(`Octopus login ${response.status}: ${text.slice(0, 200)}`);
  }

  const loginBody = JSON.parse(text) as { data?: { redirectUrl?: string } };
  if (!loginBody.data?.redirectUrl) {
    throw new Error("Octopus login : réponse inattendue (pas de redirectUrl).");
  }

  const session = await readSession(jar);
  if (!session.isAuthenticated) {
    throw new Error("Octopus login : session non authentifiée après connexion.");
  }

  let accountNumber = creds.accountNumber ?? null;
  if (!accountNumber) {
    const viewer = await graphqlRequest<{
      viewer?: { accounts?: Array<{ number: string }> };
    }>(jar, QUERY_VIEWER, undefined, "Viewer");
    accountNumber = viewer.viewer?.accounts?.[0]?.number ?? null;
  }

  const state: SessionState = {
    cookies: jar.toJSON(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    loggedInAt: Date.now(),
    accountNumber,
  };
  await saveSession(state);
  return state;
}

async function ensureSession(): Promise<{ jar: CookieJar; state: SessionState }> {
  const creds = await getCredentials();
  let state = await loadSession();
  if (!state) {
    if (!inflightLogin) inflightLogin = performLogin();
    try {
      state = await inflightLogin;
    } finally {
      inflightLogin = null;
    }
  }

  const jar = buildJar(state, creds.browserCookies);
  const session = await readSession(jar);
  if (!session.isAuthenticated) {
    await clearSession();
    state = await performLogin();
    return { jar: buildJar(state, creds.browserCookies), state };
  }

  state.cookies = jar.toJSON();
  await saveSession(state);
  return { jar, state };
}

async function resolveAccountNumber(
  jar: CookieJar,
  state: SessionState
): Promise<string> {
  if (state.accountNumber) return state.accountNumber;
  const creds = await getCredentials();
  if (creds.accountNumber) return creds.accountNumber;

  const viewer = await graphqlRequest<{
    viewer?: { accounts?: Array<{ number: string }> };
  }>(jar, QUERY_VIEWER, undefined, "Viewer");
  const accountNumber = viewer.viewer?.accounts?.[0]?.number;
  if (!accountNumber) {
    throw new Error("Aucun compte Octopus Energy trouvé pour cet utilisateur.");
  }
  state.accountNumber = accountNumber;
  await saveSession(state);
  return accountNumber;
}

function buildEligibleAgreements(
  agreements: OctopusEligibleAgreement[],
  eligibilities: Array<{
    ledgerNumber: string;
    eligibilityOutcome: string;
    expectedPaymentDate?: string;
  }>
): OctopusEligibleAgreement[] {
  const byLedger = new Map(
    eligibilities.map((e) => [e.ledgerNumber, e.eligibilityOutcome])
  );
  return agreements
    .filter((a) => a.isActive)
    .map((a) => ({
      ...a,
      eligibilityOutcome: byLedger.get(a.chargingLedger.number),
    }))
    .filter((a) => a.eligibilityOutcome === "OK");
}

export async function octopusGetSessionStatus(): Promise<OctopusSessionStatus> {
  const creds = await getCredentials();
  const stored = await loadSession();
  const jar = buildJar(stored ?? undefined, creds.browserCookies);

  if (!stored) {
    return {
      isAuthenticated: false,
      authMethod: null,
      sub: null,
      accountNumber: creds.accountNumber ?? null,
      preferredName: null,
      sessionExpiresAt: null,
    };
  }

  const session = await readSession(jar);
  let preferredName: string | null = null;
  let accountNumber = stored.accountNumber ?? creds.accountNumber ?? null;

  if (session.isAuthenticated) {
    const viewer = await graphqlRequest<{
      viewer?: { preferredName?: string; accounts?: Array<{ number: string }> };
    }>(jar, QUERY_VIEWER, undefined, "Viewer");
    preferredName = viewer.viewer?.preferredName ?? null;
    accountNumber = accountNumber ?? viewer.viewer?.accounts?.[0]?.number ?? null;
  }

  return {
    isAuthenticated: session.isAuthenticated,
    authMethod: session.authMethod,
    sub: session.sub,
    accountNumber,
    preferredName,
    sessionExpiresAt: new Date(stored.expiresAt).toISOString(),
  };
}

export async function octopusGetCagnotte(
  accountNumberInput?: string
): Promise<OctopusCagnotteStatus> {
  const { jar, state } = await ensureSession();
  const accountNumber = accountNumberInput?.trim() || (await resolveAccountNumber(jar, state));

  const data = await graphqlRequest<{
    account?: {
      creditStorage?: {
        balanceForecast?: number;
        ledger?: { number?: string; currentBalance?: number };
        sourceFundRequestEligibilities?: {
          globalEligibilityOutcome?: string;
          edges?: Array<{
            node?: {
              ledgerNumber?: string;
              eligibilityOutcome?: string;
              expectedPaymentDate?: string;
            };
          }>;
        };
      };
      agreements?: {
        edges?: Array<{ node?: OctopusEligibleAgreement }>;
      };
    };
  }>(
    jar,
    QUERY_DASHBOARD_POT,
    { accountNumber },
    "DashboardPotPage",
    `${OCTOPUS_ORIGIN}/espace-client/comptes/${accountNumber}/cagnotte`
  );

  const creditStorage = data.account?.creditStorage;
  const potLedgerNumber = creditStorage?.ledger?.number ?? "";
  const currentBalanceCents = creditStorage?.ledger?.currentBalance ?? 0;
  const balanceForecastCents = creditStorage?.balanceForecast ?? 0;
  const globalEligibilityOutcome =
    creditStorage?.sourceFundRequestEligibilities?.globalEligibilityOutcome ?? "UNKNOWN";

  const eligibilities =
    creditStorage?.sourceFundRequestEligibilities?.edges
      ?.map((e) => e.node)
      .filter((n): n is NonNullable<typeof n> => Boolean(n))
      .map((n) => ({
        ledgerNumber: n.ledgerNumber ?? "",
        eligibilityOutcome: n.eligibilityOutcome ?? "UNKNOWN",
        expectedPaymentDate: n.expectedPaymentDate,
      })) ?? [];

  const agreements =
    data.account?.agreements?.edges
      ?.map((e) => e.node)
      .filter((n): n is OctopusEligibleAgreement => Boolean(n)) ?? [];

  const eligibleAgreements = buildEligibleAgreements(agreements, eligibilities);
  const usable =
    globalEligibilityOutcome === "OK" &&
    balanceForecastCents > 0 &&
    eligibleAgreements.length > 0 &&
    Boolean(potLedgerNumber);

  return {
    accountNumber,
    potLedgerNumber,
    currentBalanceCents,
    balanceForecastCents,
    globalEligibilityOutcome,
    usable,
    usableAmountCents: usable ? balanceForecastCents : 0,
    eligibleAgreements,
    message: eligibilityMessage(globalEligibilityOutcome, balanceForecastCents),
  };
}

export async function octopusUseCagnotte(options?: {
  accountNumber?: string;
  amountCents?: number;
  agreementId?: number;
}): Promise<OctopusUseCagnotteResult> {
  const status = await octopusGetCagnotte(options?.accountNumber);
  if (!status.usable) {
    throw new Error(status.message);
  }

  const agreement =
    (options?.agreementId
      ? status.eligibleAgreements.find((a) => a.id === options.agreementId)
      : null) ?? status.eligibleAgreements[0];

  if (!agreement) {
    throw new Error("Aucun contrat éligible pour utiliser la cagnotte.");
  }

  const requestedAmount = options?.amountCents ?? status.balanceForecastCents;
  if (requestedAmount <= 0 || requestedAmount > status.balanceForecastCents) {
    throw new Error(
      `Montant invalide. Maximum utilisable : ${formatEuros(status.balanceForecastCents)}.`
    );
  }

  const { jar } = await ensureSession();
  const input = {
    accountNumber: status.accountNumber,
    sourceLedgerNumber: status.potLedgerNumber,
    targetLedgerNumber: agreement.chargingLedger.number,
    requestedAmount,
  };

  const data = await graphqlRequest<{
    createSourceFundRequest?: { sourceFundRequest?: { status?: string } };
  }>(
    jar,
    MUTATION_CREATE_SOURCE_FUND,
    { input },
    "CreateSourceFundRequest",
    `${OCTOPUS_ORIGIN}/espace-client/comptes/${status.accountNumber}/cagnotte/resume`
  );

  const fundStatus = data.createSourceFundRequest?.sourceFundRequest?.status ?? "UNKNOWN";
  if (fundStatus !== "REQUESTED") {
    throw new Error(`Utilisation cagnotte refusée (statut : ${fundStatus}).`);
  }

  return {
    accountNumber: status.accountNumber,
    status: fundStatus,
    requestedAmountCents: requestedAmount,
    sourceLedgerNumber: input.sourceLedgerNumber,
    targetLedgerNumber: input.targetLedgerNumber,
    message: `Demande enregistrée : ${formatEuros(requestedAmount)} seront déduits du prochain prélèvement.`,
  };
}

export async function octopusForceRelogin(): Promise<OctopusSessionStatus> {
  await clearSession();
  await performLogin();
  return octopusGetSessionStatus();
}

export async function octopusLogout(): Promise<{ ok: true }> {
  await clearSession();
  return { ok: true };
}
