import crypto from "node:crypto";

/**
 * Payment provider PORT (the seam, not the integration).
 *
 * The merchant account exists but is NOT wired in this task. Everything goes
 * through one provider-agnostic interface so switching to the real provider is
 * "credentials + one adapter file", not a redesign. Today the only adapter is a
 * deterministic MOCK that simulates the provider end-to-end in dev — it refuses
 * to run in production.
 *
 * SECURITY: card numbers / CVV / expiry NEVER reach this server. The provider's
 * hosted fields or redirect collect them; here we only ever see an opaque intent
 * id. Payment success is established ONLY by a signed webhook verified here —
 * never by a client callback/redirect (those are forgeable).
 */

export const PAYMENT_CURRENCY = "ILS";
export const WEBHOOK_SIGNATURE_HEADER = "x-payment-signature";

export const PAYMENTS_DISABLED_CODE = "PAYMENTS_DISABLED";
export const PAYMENTS_DISABLED_MESSAGE = "Card payments are not enabled.";
export const WEBHOOK_INVALID_SIGNATURE_MESSAGE = "Invalid webhook signature.";

/** Card payments are hidden + their endpoints 503 unless this is exactly "true". */
export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

export type PaymentIntent = { intentId: string; clientToken: string };
export type ProviderPaymentStatus = "pending" | "paid" | "failed";
export type WebhookEvent = { intentId: string; status: ProviderPaymentStatus; amountMinor: number };

export interface PaymentAdapter {
  readonly name: string;
  createIntent(input: { orderId: string; amountMinor: number; currency: string }): Promise<PaymentIntent>;
  getStatus(intentId: string): Promise<ProviderPaymentStatus>;
  /** Verify the signature and parse the event — THROWS on an invalid signature. */
  verifyAndParseWebhook(rawBody: string, signature: string): WebhookEvent;
  refund(intentId: string, amountMinor: number): Promise<{ ok: boolean }>;
  /** Mock only: sign a payload so dev/tests can simulate the provider POSTing a webhook. */
  signPayload?(payload: string): string;
}

// ---------- mock adapter (dev only) ----------

const MOCK_WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET || "sari-dev-mock-webhook-secret";

function mockHmac(body: string): string {
  return crypto.createHmac("sha256", MOCK_WEBHOOK_SECRET).update(body).digest("hex");
}

const mockAdapter: PaymentAdapter = {
  name: "mock",
  async createIntent({ orderId }) {
    // Deterministic, opaque — carries no card data.
    return { intentId: `mock_${orderId}`, clientToken: `mocktok_${orderId}` };
  },
  async getStatus() {
    return "pending";
  },
  verifyAndParseWebhook(rawBody, signature) {
    const expected = mockHmac(rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature || "");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error(WEBHOOK_INVALID_SIGNATURE_MESSAGE);
    }
    const parsed = JSON.parse(rawBody) as { intentId?: string; status?: string; amountMinor?: number };
    if (!parsed.intentId || !parsed.status) {
      throw new Error("Malformed webhook payload.");
    }
    return {
      intentId: String(parsed.intentId),
      status: parsed.status as ProviderPaymentStatus,
      amountMinor: Math.trunc(Number(parsed.amountMinor ?? 0)),
    };
  },
  async refund() {
    return { ok: true };
  },
  signPayload(payload) {
    return mockHmac(payload);
  },
};

/**
 * Selects the active adapter. The mock must NEVER run in production — a real
 * adapter has to be wired here first (see DEV_NOTES §payments). This is the
 * "refuse to load in production, loudly" guard.
 */
function getAdapter(): PaymentAdapter {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENTS: the mock payment adapter must never run in production. Implement a real adapter in " +
        "payments.service.ts (createIntent/getStatus/verifyAndParseWebhook/refund) and select it here " +
        "before enabling PAYMENTS_ENABLED in production."
    );
  }
  return mockAdapter;
}

// ---------- provider-agnostic port ----------

export async function createPaymentIntent(order: { id: string; amountMinor: number }): Promise<PaymentIntent> {
  if (!isPaymentsEnabled()) {
    throw new Error(PAYMENTS_DISABLED_MESSAGE);
  }
  if (!Number.isInteger(order.amountMinor) || order.amountMinor <= 0) {
    throw new Error("Payment amount must be a positive integer of minor units.");
  }
  return getAdapter().createIntent({ orderId: order.id, amountMinor: order.amountMinor, currency: PAYMENT_CURRENCY });
}

export async function getPaymentStatus(intentId: string): Promise<ProviderPaymentStatus> {
  return getAdapter().getStatus(intentId);
}

/** Verify + parse a provider webhook. Throws WEBHOOK_INVALID_SIGNATURE_MESSAGE on a bad signature. */
export function handleWebhook(rawBody: string, signature: string): WebhookEvent {
  return getAdapter().verifyAndParseWebhook(rawBody, signature);
}

/**
 * Refund port — EXISTS but intentionally UNUSED (pending decision). Shortages on
 * a card-paid order are resolved by a ledger credit that reduces the next
 * invoice, not by a card refund. Only wire this if a customer demands money back.
 */
export async function refundPayment(intentId: string, amountMinor: number): Promise<{ ok: boolean }> {
  return getAdapter().refund(intentId, amountMinor);
}

/** Dev/mock only: sign a payload so a simulated provider can POST a valid webhook. */
export function signMockWebhookPayload(payload: string): string {
  const adapter = getAdapter();
  if (!adapter.signPayload) {
    throw new Error("The active payment adapter cannot sign payloads (not the mock).");
  }
  return adapter.signPayload(payload);
}

/** True when the active adapter is the dev mock (gates the mock-complete endpoint). */
export function isMockAdapterActive(): boolean {
  return process.env.NODE_ENV !== "production" && getAdapter().name === "mock";
}

// ---------- per-user intent-creation rate limit ----------

export const PAYMENT_RATE_LIMITED_MESSAGE = "Too many payment attempts. Please wait a moment.";
export const PAYMENT_RATE_LIMITED_CODE = "PAYMENT_RATE_LIMITED";

const INTENT_WINDOW_MS = 60_000;
const INTENT_MAX_PER_WINDOW = 10;
const intentHits = new Map<string, number[]>();

/**
 * Throttles card intent creation per user (single-process in-memory — moves to
 * a shared store when the app scales, same as the event bus). Throws
 * PAYMENT_RATE_LIMITED_MESSAGE (→ 429) past the window budget.
 */
export function assertIntentRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (intentHits.get(userId) ?? []).filter((t) => now - t < INTENT_WINDOW_MS);
  if (recent.length >= INTENT_MAX_PER_WINDOW) {
    throw new Error(PAYMENT_RATE_LIMITED_MESSAGE);
  }
  recent.push(now);
  intentHits.set(userId, recent);
}
