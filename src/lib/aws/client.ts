import { createHmac, createHash } from "crypto";
import { getServiceKeys } from "@/lib/keys/store";

interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

async function getConfig(): Promise<AwsConfig> {
  const keys = await getServiceKeys("aws");
  const accessKeyId = keys?.accessKeyId;
  const secretAccessKey = keys?.secretAccessKey;
  const region = keys?.region ?? "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Les clés AWS ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { accessKeyId, secretAccessKey, region };
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function getSigningKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function awsPost<T>(
  service: string,
  host: string,
  target: string,
  body: object
): Promise<T> {
  const config = await getConfig();
  const region = service === "ce" ? "us-east-1" : config.region;
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const dateTime = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const date = dateTime.slice(0, 8);

  const payloadHash = sha256Hex(bodyStr);
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${dateTime}\nx-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateTime,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(config.secretAccessKey, date, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      Host: host,
      "X-Amz-Date": dateTime,
      "X-Amz-Target": target,
      Authorization: authHeader,
    },
    body: bodyStr,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AWS API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface AwsCostGroup {
  Keys: string[];
  Metrics: Record<string, { Amount: string; Unit: string }>;
}

export interface AwsCostAndUsageResult {
  ResultsByTime: Array<{
    TimePeriod: { Start: string; End: string };
    Total: Record<string, { Amount: string; Unit: string }>;
    Groups: AwsCostGroup[];
    Estimated: boolean;
  }>;
  DimensionValueAttributes?: Array<{ Value: string; Attributes: Record<string, string> }>;
}

export async function getCostAndUsage(params: {
  startDate: string;
  endDate: string;
  granularity?: "DAILY" | "MONTHLY" | "HOURLY";
  groupBy?: Array<{ type: "DIMENSION" | "TAG"; key: string }>;
  metrics?: string[];
  filter?: object;
}): Promise<AwsCostAndUsageResult> {
  const body: Record<string, unknown> = {
    TimePeriod: { Start: params.startDate, End: params.endDate },
    Granularity: params.granularity ?? "MONTHLY",
    Metrics: params.metrics ?? ["UnblendedCost", "UsageQuantity"],
  };

  if (params.groupBy?.length) {
    body["GroupBy"] = params.groupBy.map((g) => ({ Type: g.type, Key: g.key }));
  }

  if (params.filter) {
    body["Filter"] = params.filter;
  }

  return awsPost<AwsCostAndUsageResult>(
    "ce",
    "ce.us-east-1.amazonaws.com",
    "AmazonCEService.GetCostAndUsage",
    body
  );
}

export interface AwsBillingPeriod {
  TimePeriod: { Start: string; End: string };
  Total: Record<string, { Amount: string; Unit: string }>;
}

export async function getCostForecast(params: {
  startDate: string;
  endDate: string;
  granularity?: "DAILY" | "MONTHLY";
  metric?: string;
}): Promise<{ Total: { Amount: string; Unit: string }; ForecastResultsByTime: AwsBillingPeriod[] }> {
  const body = {
    TimePeriod: { Start: params.startDate, End: params.endDate },
    Granularity: params.granularity ?? "MONTHLY",
    Metric: params.metric ?? "UNBLENDED_COST",
  };

  return awsPost(
    "ce",
    "ce.us-east-1.amazonaws.com",
    "AmazonCEService.GetCostForecast",
    body
  );
}

export interface AwsServiceDimension {
  Value: string;
  Attributes: Record<string, string>;
}

export async function getDimensionValues(params: {
  startDate: string;
  endDate: string;
  dimension: string;
}): Promise<{ DimensionValues: AwsServiceDimension[] }> {
  const body = {
    TimePeriod: { Start: params.startDate, End: params.endDate },
    Dimension: params.dimension,
  };

  return awsPost(
    "ce",
    "ce.us-east-1.amazonaws.com",
    "AmazonCEService.GetDimensionValues",
    body
  );
}
