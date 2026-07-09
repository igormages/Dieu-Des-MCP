import { getServiceKeys, getKvClient } from "@/lib/keys/store";
import type {
  DayOfWeek,
  OctopusChargeSchedule,
  OctopusChargeScheduleEntry,
  OctopusSessionStatus,
  OctopusSetChargeTargetResult,
  OctopusSmartFlexDevice,
} from "./types";

const KRAKEN_GRAPHQL_URL = "https://api.oefr-kraken.energy/v1/graphql/";
const SESSION_KEY = "octopus:session:default";
const USER_AGENT = "OctoAppClient/4.134.0 (IOS 26.6; iPhone)";

const DAYS_OF_WEEK: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const MUTATION_LOGIN = `mutation Login($input: ObtainJSONWebTokenInput!) {
  obtainKrakenToken(input: $input) {
    __typename
    refreshExpiresIn
    refreshToken
    token
  }
}`;

const MUTATION_LONG_LIVED_REFRESH = `mutation generateLongLivedRefreshToken($input: ObtainLongLivedRefreshTokenInput!) {
  obtainLongLivedRefreshToken(input: $input) {
    __typename
    refreshToken
    refreshExpiresIn
  }
}`;

const QUERY_GET_USER = `query GetUser {
  viewer {
    __typename
    id
    preferredName
    email
  }
}`;

const QUERY_GET_ACCOUNT_LIST = `query GetAccountList {
  viewer {
    __typename
    accounts {
      __typename
      number
    }
  }
}`;

const QUERY_GET_SMART_FLEX_DEVICES = `query GetSmartFlexDevices($accountNumber: String!, $deviceId: String) {
  devices(accountNumber: $accountNumber, deviceId: $deviceId) {
    __typename
    id
    name
    deviceType
    provider
    propertyId
    status {
      __typename
      current
      isSuspended
    }
    ... on SmartFlexVehicle {
      make
    }
  }
}`;

const QUERY_GET_SMART_FLEX_PREFERENCES = `query GetSmartFlexDevicePreferences($accountNumber: String!, $deviceId: String) {
  devices(accountNumber: $accountNumber, deviceId: $deviceId) {
    __typename
    id
    name
    preferences {
      __typename
      targetType
      unit
      mode
      schedules {
        __typename
        dayOfWeek
        time
        min
        max
        upperLimit
      }
    }
  }
}`;

const MUTATION_SET_SMART_FLEX_PREFERENCES = `mutation SetSmartFlexDevicePreferences($input: SmartFlexDevicePreferencesInput!) {
  setDevicePreferences(input: $input) {
    __typename
    id
    name
    preferences {
      __typename
      targetType
      unit
      mode
      schedules {
        __typename
        dayOfWeek
        time
        min
        max
      }
    }
  }
}`;

interface OctopusCredentials {
  email: string;
  password: string;
  accountNumber?: string;
  deviceId?: string;
}

interface SessionState {
  token: string;
  refreshToken: string;
  refreshExpiresIn: number;
  tokenExpiresAt: number;
  loggedInAt: number;
  accountNumber: string | null;
  sub: string | null;
  preferredName: string | null;
}

let memorySession: SessionState | null = null;
let inflightSession: Promise<SessionState> | null = null;

const TOKEN_REFRESH_BUFFER_MS = 60_000;

function isRefreshExpired(state: SessionState): boolean {
  return state.refreshExpiresIn * 1000 <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

function isTokenExpired(state: SessionState): boolean {
  return state.tokenExpiresAt <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

function refreshExpiresAtIso(state: SessionState): string {
  return new Date(state.refreshExpiresIn * 1000).toISOString();
}

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
    deviceId:
      (typeof keys?.deviceId === "string" && keys.deviceId.trim()) ||
      process.env.OCTOPUS_DEVICE_ID?.trim() ||
      undefined,
  };
}

function parseGraphqlBody<T>(text: string): T {
  let jsonText = text.trim();
  if (jsonText.startsWith("eyJ")) {
    jsonText = Buffer.from(jsonText, "base64").toString("utf8");
  }
  const body = JSON.parse(jsonText) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(`Octopus GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  if (!body.data) {
    throw new Error("Octopus GraphQL: réponse vide.");
  }
  return body.data;
}

function decodeJwtSub(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")) as {
    sub?: string;
    exp?: number;
  };
  return payload.sub ?? null;
}

function decodeJwtExpMs(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) return Date.now() + 3600_000;
  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")) as {
    exp?: number;
  };
  return (payload.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
}

async function loadSession(): Promise<SessionState | null> {
  if (memorySession && !isRefreshExpired(memorySession)) {
    return memorySession;
  }
  const kv = getKvClient();
  if (!kv) {
    return memorySession && !isRefreshExpired(memorySession) ? memorySession : null;
  }
  const raw = await kv.get<SessionState>(SESSION_KEY);
  if (!raw || isRefreshExpired(raw)) return null;
  memorySession = raw;
  return raw;
}

async function saveSession(state: SessionState): Promise<void> {
  memorySession = state;
  const kv = getKvClient();
  if (!kv) return;
  const ttlSeconds = Math.max(
    60,
    Math.floor((state.refreshExpiresIn * 1000 - Date.now()) / 1000)
  );
  await kv.set(SESSION_KEY, state, { ex: ttlSeconds });
}

async function clearSession(): Promise<void> {
  memorySession = null;
  const kv = getKvClient();
  if (kv) await kv.del(SESSION_KEY);
}

async function graphqlRequest<T>(
  token: string | null,
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string
): Promise<T> {
  const headers: Record<string, string> = {
    accept:
      "multipart/mixed;deferSpec=20220824, application/graphql-response+json, application/json",
    "content-type": "application/json",
    "user-agent": USER_AGENT,
  };
  if (operationName) headers["x-apollo-operation-name"] = operationName;
  if (token) headers.authorization = token;

  const response = await fetch(KRAKEN_GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables, operationName }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Octopus API ${response.status}: ${text.slice(0, 300)}`);
  }
  return parseGraphqlBody<T>(text);
}

async function obtainLongLivedRefreshToken(
  accessToken: string,
  fallback: { refreshToken: string; refreshExpiresIn: number }
): Promise<{ refreshToken: string; refreshExpiresIn: number }> {
  const longLived = await graphqlRequest<{
    obtainLongLivedRefreshToken?: {
      refreshToken: string;
      refreshExpiresIn: number;
    };
  }>(
    accessToken,
    MUTATION_LONG_LIVED_REFRESH,
    { input: { krakenToken: accessToken } },
    "generateLongLivedRefreshToken"
  );
  if (longLived.obtainLongLivedRefreshToken?.refreshToken) {
    return {
      refreshToken: longLived.obtainLongLivedRefreshToken.refreshToken,
      refreshExpiresIn: longLived.obtainLongLivedRefreshToken.refreshExpiresIn,
    };
  }
  return fallback;
}

async function performTokenRefresh(state: SessionState): Promise<SessionState> {
  const refreshData = await graphqlRequest<{
    obtainKrakenToken?: {
      token: string;
      refreshToken: string;
      refreshExpiresIn: number;
    };
  }>(
    null,
    MUTATION_LOGIN,
    { input: { refreshToken: state.refreshToken } },
    "Login"
  );

  const refreshResult = refreshData.obtainKrakenToken;
  if (!refreshResult?.token) {
    throw new Error("Octopus refresh : token absent dans la réponse.");
  }

  const { refreshToken, refreshExpiresIn } = await obtainLongLivedRefreshToken(
    refreshResult.token,
    {
      refreshToken: refreshResult.refreshToken ?? state.refreshToken,
      refreshExpiresIn: refreshResult.refreshExpiresIn ?? state.refreshExpiresIn,
    }
  );

  const updated: SessionState = {
    ...state,
    token: refreshResult.token,
    refreshToken,
    refreshExpiresIn,
    tokenExpiresAt: decodeJwtExpMs(refreshResult.token),
    sub: decodeJwtSub(refreshResult.token) ?? state.sub,
  };
  await saveSession(updated);
  return updated;
}

async function performLogin(): Promise<SessionState> {
  const creds = await getCredentials();

  const loginData = await graphqlRequest<{
    obtainKrakenToken?: {
      token: string;
      refreshToken: string;
      refreshExpiresIn: number;
    };
  }>(
    null,
    MUTATION_LOGIN,
    { input: { email: creds.email, password: creds.password } },
    "Login"
  );

  const loginResult = loginData.obtainKrakenToken;
  if (!loginResult?.token) {
    throw new Error("Octopus login : token absent dans la réponse.");
  }

  let refreshToken = loginResult.refreshToken;
  let refreshExpiresIn = loginResult.refreshExpiresIn;

  ({ refreshToken, refreshExpiresIn } = await obtainLongLivedRefreshToken(
    loginResult.token,
    { refreshToken, refreshExpiresIn }
  ));

  const userData = await graphqlRequest<{
    viewer?: { preferredName?: string };
  }>(loginResult.token, QUERY_GET_USER, undefined, "GetUser");

  let accountNumber = creds.accountNumber ?? null;
  if (!accountNumber) {
    const accountsData = await graphqlRequest<{
      viewer?: { accounts?: Array<{ number: string }> };
    }>(loginResult.token, QUERY_GET_ACCOUNT_LIST, undefined, "GetAccountList");
    accountNumber = accountsData.viewer?.accounts?.[0]?.number ?? null;
  }

  const state: SessionState = {
    token: loginResult.token,
    refreshToken,
    refreshExpiresIn,
    tokenExpiresAt: decodeJwtExpMs(loginResult.token),
    loggedInAt: Date.now(),
    accountNumber,
    sub: decodeJwtSub(loginResult.token),
    preferredName: userData.viewer?.preferredName ?? null,
  };
  await saveSession(state);
  return state;
}

async function ensureSessionInner(): Promise<SessionState> {
  let state = await loadSession();
  if (!state) {
    return performLogin();
  }
  if (isTokenExpired(state)) {
    try {
      state = await performTokenRefresh(state);
    } catch {
      await clearSession();
      state = await performLogin();
    }
  }
  return state;
}

async function ensureSession(): Promise<SessionState> {
  if (!inflightSession) inflightSession = ensureSessionInner();
  try {
    return await inflightSession;
  } finally {
    inflightSession = null;
  }
}

async function resolveAccountNumber(state: SessionState): Promise<string> {
  if (state.accountNumber) return state.accountNumber;
  const creds = await getCredentials();
  if (creds.accountNumber) return creds.accountNumber;

  const accountsData = await graphqlRequest<{
    viewer?: { accounts?: Array<{ number: string }> };
  }>(state.token, QUERY_GET_ACCOUNT_LIST, undefined, "GetAccountList");
  const accountNumber = accountsData.viewer?.accounts?.[0]?.number;
  if (!accountNumber) {
    throw new Error("Aucun compte Octopus Energy trouvé.");
  }
  state.accountNumber = accountNumber;
  await saveSession(state);
  return accountNumber;
}

function normalizeTime(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    throw new Error("Format d'heure invalide. Utilisez HH:MM (ex. 05:00).");
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) {
    throw new Error("Heure invalide. Utilisez HH:MM entre 00:00 et 23:59.");
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatScheduleTime(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function mapSchedules(
  schedules: Array<{
    dayOfWeek?: string;
    time?: string;
    max?: number | null;
  }>
): OctopusChargeScheduleEntry[] {
  return schedules
    .filter((s) => s.dayOfWeek && s.time)
    .map((s) => ({
      dayOfWeek: s.dayOfWeek as DayOfWeek,
      time: formatScheduleTime(s.time!),
      max: s.max ?? null,
    }));
}

export async function octopusGetSessionStatus(): Promise<OctopusSessionStatus> {
  const creds = await getCredentials();
  const stored = await loadSession();

  if (!stored) {
    return {
      isAuthenticated: false,
      sub: null,
      accountNumber: creds.accountNumber ?? null,
      preferredName: null,
      tokenExpiresAt: null,
      refreshExpiresAt: null,
    };
  }

  return {
    isAuthenticated: !isRefreshExpired(stored),
    sub: stored.sub,
    accountNumber: stored.accountNumber ?? creds.accountNumber ?? null,
    preferredName: stored.preferredName,
    tokenExpiresAt: new Date(stored.tokenExpiresAt).toISOString(),
    refreshExpiresAt: refreshExpiresAtIso(stored),
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

export async function octopusGetChargeDevices(options?: {
  accountNumber?: string;
  deviceId?: string;
}): Promise<{
  accountNumber: string;
  devices: OctopusSmartFlexDevice[];
}> {
  const state = await ensureSession();
  const accountNumber =
    options?.accountNumber?.trim() || (await resolveAccountNumber(state));
  const deviceId = options?.deviceId?.trim() || undefined;

  const data = await graphqlRequest<{
    devices?: Array<{
      id: string;
      name: string;
      deviceType: string;
      provider: string;
      propertyId: string;
      make?: string;
      status?: { current?: string; isSuspended?: boolean };
    }>;
  }>(
    state.token,
    QUERY_GET_SMART_FLEX_DEVICES,
    { accountNumber, deviceId: deviceId ?? null },
    "GetSmartFlexDevices"
  );

  const devices: OctopusSmartFlexDevice[] =
    data.devices?.map((d) => ({
      id: d.id,
      name: d.name,
      deviceType: d.deviceType,
      provider: d.provider,
      propertyId: d.propertyId,
      make: d.make,
      status: {
        current: d.status?.current ?? "UNKNOWN",
        isSuspended: Boolean(d.status?.isSuspended),
      },
    })) ?? [];

  return { accountNumber, devices };
}

async function resolveDeviceId(
  state: SessionState,
  accountNumber: string,
  deviceIdInput?: string
): Promise<{ deviceId: string; deviceName: string }> {
  if (deviceIdInput?.trim()) {
    const { devices } = await octopusGetChargeDevices({
      accountNumber,
      deviceId: deviceIdInput.trim(),
    });
    const device = devices.find((d) => d.id === deviceIdInput.trim());
    return {
      deviceId: deviceIdInput.trim(),
      deviceName: device?.name ?? deviceIdInput.trim(),
    };
  }

  const creds = await getCredentials();
  if (creds.deviceId) {
    const { devices } = await octopusGetChargeDevices({
      accountNumber,
      deviceId: creds.deviceId,
    });
    const device = devices.find((d) => d.id === creds.deviceId);
    if (device) return { deviceId: device.id, deviceName: device.name };
  }

  const { devices } = await octopusGetChargeDevices({ accountNumber });
  const device = devices[0];
  if (!device) {
    throw new Error("Aucun véhicule Smart Flex trouvé sur ce compte Octopus.");
  }
  return { deviceId: device.id, deviceName: device.name };
}

export async function octopusGetChargeSchedule(options?: {
  accountNumber?: string;
  deviceId?: string;
}): Promise<OctopusChargeSchedule> {
  const state = await ensureSession();
  const accountNumber =
    options?.accountNumber?.trim() || (await resolveAccountNumber(state));
  const { deviceId, deviceName } = await resolveDeviceId(
    state,
    accountNumber,
    options?.deviceId
  );

  const data = await graphqlRequest<{
    devices?: Array<{
      id: string;
      name: string;
      preferences?: {
        targetType?: string;
        unit?: string;
        mode?: string;
        schedules?: Array<{
          dayOfWeek?: string;
          time?: string;
          max?: number | null;
        }>;
      };
    }>;
  }>(
    state.token,
    QUERY_GET_SMART_FLEX_PREFERENCES,
    { accountNumber, deviceId },
    "GetSmartFlexDevicePreferences"
  );

  const device = data.devices?.[0];
  const preferences = device?.preferences;
  const schedules = mapSchedules(preferences?.schedules ?? []);
  const mondayTime = schedules.find((s) => s.dayOfWeek === "MONDAY")?.time;

  return {
    accountNumber,
    deviceId,
    deviceName: device?.name ?? deviceName,
    mode: preferences?.mode ?? "CHARGE",
    unit: preferences?.unit ?? "PERCENTAGE",
    targetType: preferences?.targetType ?? "ABSOLUTE_STATE_OF_CHARGE",
    schedules,
    message: mondayTime
      ? `Heure cible de recharge : ${mondayTime} (tous les jours).`
      : "Aucun horaire de recharge configuré.",
  };
}

export async function octopusSetChargeTargetTime(options: {
  time: string;
  accountNumber?: string;
  deviceId?: string;
  maxPercent?: number;
}): Promise<OctopusSetChargeTargetResult> {
  const normalizedTime = normalizeTime(options.time);
  const maxPercent = options.maxPercent ?? 100;
  if (maxPercent <= 0 || maxPercent > 100) {
    throw new Error("maxPercent doit être entre 1 et 100.");
  }

  const state = await ensureSession();
  const accountNumber =
    options.accountNumber?.trim() || (await resolveAccountNumber(state));
  const { deviceId, deviceName } = await resolveDeviceId(
    state,
    accountNumber,
    options.deviceId
  );

  const schedules = DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    time: normalizedTime,
    max: maxPercent,
  }));

  const data = await graphqlRequest<{
    setDevicePreferences?: {
      id: string;
      name: string;
      preferences?: {
        schedules?: Array<{
          dayOfWeek?: string;
          time?: string;
          max?: number | null;
        }>;
      };
    };
  }>(
    state.token,
    MUTATION_SET_SMART_FLEX_PREFERENCES,
    {
      input: {
        deviceId,
        mode: "CHARGE",
        unit: "PERCENTAGE",
        schedules,
      },
    },
    "SetSmartFlexDevicePreferences"
  );

  const resultSchedules = mapSchedules(
    data.setDevicePreferences?.preferences?.schedules ?? schedules
  );

  return {
    accountNumber,
    deviceId,
    deviceName: data.setDevicePreferences?.name ?? deviceName,
    time: normalizedTime,
    maxPercent,
    schedules: resultSchedules,
    message: `Heure cible de recharge mise à jour : ${normalizedTime} (${maxPercent} %).`,
  };
}
