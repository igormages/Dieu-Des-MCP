import { getServiceKeys } from "@/lib/keys/store";

const PADDLE_API_BASE = "https://vendors.paddle.com/api/2.0";

interface SetappConfig {
  vendorId: string;
  vendorAuthCode: string;
}

async function getConfig(): Promise<SetappConfig> {
  const keys = await getServiceKeys("setapp");
  const vendorId = keys?.vendorId;
  const vendorAuthCode = keys?.vendorAuthCode;

  if (!vendorId || !vendorAuthCode) {
    throw new Error(
      "Les clés Setapp/Paddle ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { vendorId, vendorAuthCode };
}

async function paddlePost<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  const config = await getConfig();

  const response = await fetch(`${PADDLE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendor_id: config.vendorId,
      vendor_auth_code: config.vendorAuthCode,
      ...body,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paddle API error ${response.status}: ${text}`);
  }

  const data = await response.json() as { success: boolean; response: T; error?: { message: string; code: number } };

  if (!data.success) {
    throw new Error(`Paddle API error: ${data.error?.message ?? "Unknown error"}`);
  }

  return data.response;
}

export interface PaddleTransaction {
  order_id: string;
  checkout_id: string;
  amount: string;
  currency: string;
  status: string;
  created_at: string;
  passthrough?: string;
  product_id: number;
  receipt_url: string;
  payment_tax: string;
  payment_method: string;
  coupon: string;
  customer_name: string;
  email: string;
  country: string;
}

export interface PaddleTransactionListResponse {
  total: number;
  count: number;
  per_page: number;
  current_page: number;
  last_page: number;
  has_next_page: boolean;
  data: PaddleTransaction[];
}

export async function listTransactions(params?: {
  from?: string;
  to?: string;
  subscriptionId?: number;
  page?: number;
  resultsPerPage?: number;
}): Promise<PaddleTransactionListResponse> {
  const body: Record<string, unknown> = {};
  if (params?.from) body["from"] = params.from;
  if (params?.to) body["to"] = params.to;
  if (params?.subscriptionId) body["subscription_id"] = params.subscriptionId;
  if (params?.page) body["page"] = params.page;
  if (params?.resultsPerPage) body["results_per_page"] = params.resultsPerPage;

  return paddlePost<PaddleTransactionListResponse>("/transaction/list", body);
}

export interface PaddleSubscription {
  subscription_id: number;
  plan_id: number;
  user_id: number;
  user_email: string;
  marketing_consent: boolean;
  update_url: string;
  cancel_url: string;
  state: string;
  signup_date: string;
  last_payment: { amount: number; currency: string; date: string };
  next_payment: { amount: number; currency: string; date: string };
  payment_information: {
    payment_method: string;
    card_type?: string;
    last_four_digits?: string;
    expiry_date?: string;
  };
}

export interface PaddleSubscriptionsResponse {
  total: number;
  count: number;
  current_page: number;
  has_next_page: boolean;
  data: PaddleSubscription[];
}

export async function listSubscriptions(params?: {
  plan?: number;
  state?: "active" | "past_due" | "trialing" | "paused" | "deleted";
  subscriptionId?: number;
  page?: number;
  resultsPerPage?: number;
}): Promise<PaddleSubscriptionsResponse> {
  const body: Record<string, unknown> = {};
  if (params?.plan) body["plan"] = params.plan;
  if (params?.state) body["state"] = params.state;
  if (params?.subscriptionId) body["subscription_id"] = params.subscriptionId;
  if (params?.page) body["page"] = params.page;
  if (params?.resultsPerPage) body["results_per_page"] = params.resultsPerPage;

  return paddlePost<PaddleSubscriptionsResponse>("/subscription/users", body);
}

export interface PaddlePayment {
  id: number;
  subscription_id: number;
  amount: number;
  currency: string;
  payout_date: string;
  is_paid: number;
  receipt_url: string;
}

export async function listPayments(params?: {
  subscriptionId?: number;
  isPaid?: 0 | 1;
  from?: string;
  to?: string;
  isOneOffCharge?: boolean;
}): Promise<PaddlePayment[]> {
  const body: Record<string, unknown> = {};
  if (params?.subscriptionId) body["subscription_id"] = params.subscriptionId;
  if (params?.isPaid !== undefined) body["is_paid"] = params.isPaid;
  if (params?.from) body["from"] = params.from;
  if (params?.to) body["to"] = params.to;
  if (params?.isOneOffCharge !== undefined) body["is_one_off_charge"] = params.isOneOffCharge;

  return paddlePost<PaddlePayment[]>("/subscription/payments", body);
}
