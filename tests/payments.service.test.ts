import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertIntentRateLimit,
  createPaymentIntent,
  handleWebhook,
  isMockAdapterActive,
  isPaymentsEnabled,
  PAYMENTS_DISABLED_MESSAGE,
  signMockWebhookPayload,
  WEBHOOK_INVALID_SIGNATURE_MESSAGE,
} from "@/services/payments.service";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("payments port (provider seam + mock adapter)", () => {
  describe("PAYMENTS_ENABLED gate (default false)", () => {
    it("is disabled unless the env var is exactly 'true'", () => {
      vi.stubEnv("PAYMENTS_ENABLED", "");
      expect(isPaymentsEnabled()).toBe(false);
      vi.stubEnv("PAYMENTS_ENABLED", "1");
      expect(isPaymentsEnabled()).toBe(false);
      vi.stubEnv("PAYMENTS_ENABLED", "true");
      expect(isPaymentsEnabled()).toBe(true);
    });

    it("createPaymentIntent throws the stable disabled message when off", async () => {
      vi.stubEnv("PAYMENTS_ENABLED", "false");
      await expect(createPaymentIntent({ id: "o1", amountMinor: 1000 })).rejects.toThrow(
        PAYMENTS_DISABLED_MESSAGE
      );
    });
  });

  describe("webhook signature verification (security boundary)", () => {
    it("accepts a payload signed with the mock secret and parses it", () => {
      const payload = JSON.stringify({ intentId: "mock_o1", status: "paid", amountMinor: 9000 });
      const sig = signMockWebhookPayload(payload);
      const event = handleWebhook(payload, sig);
      expect(event).toEqual({ intentId: "mock_o1", status: "paid", amountMinor: 9000 });
    });

    it("REJECTS a tampered payload (signature no longer matches)", () => {
      const payload = JSON.stringify({ intentId: "mock_o1", status: "paid", amountMinor: 9000 });
      const sig = signMockWebhookPayload(payload);
      const tampered = payload.replace("9000", "1");
      expect(() => handleWebhook(tampered, sig)).toThrow(WEBHOOK_INVALID_SIGNATURE_MESSAGE);
    });

    it("REJECTS a missing/garbage signature", () => {
      const payload = JSON.stringify({ intentId: "mock_o1", status: "paid", amountMinor: 9000 });
      expect(() => handleWebhook(payload, "")).toThrow(WEBHOOK_INVALID_SIGNATURE_MESSAGE);
      expect(() => handleWebhook(payload, "deadbeef")).toThrow(WEBHOOK_INVALID_SIGNATURE_MESSAGE);
    });
  });

  describe("mock adapter refuses to load outside dev", () => {
    it("throws loudly under NODE_ENV=production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const payload = JSON.stringify({ intentId: "x", status: "paid", amountMinor: 1 });
      expect(() => handleWebhook(payload, "sig")).toThrow(/must never run in production/);
      expect(isMockAdapterActive()).toBe(false);
    });

    it("createPaymentIntent in production fails even when enabled (no real adapter wired)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PAYMENTS_ENABLED", "true");
      await expect(createPaymentIntent({ id: "o1", amountMinor: 1000 })).rejects.toThrow(
        /must never run in production/
      );
    });
  });

  describe("intent amount validation + rate limit", () => {
    it("rejects non-integer / non-positive minor amounts", async () => {
      vi.stubEnv("PAYMENTS_ENABLED", "true");
      await expect(createPaymentIntent({ id: "o1", amountMinor: 10.5 })).rejects.toThrow(/minor units/);
      await expect(createPaymentIntent({ id: "o1", amountMinor: 0 })).rejects.toThrow(/minor units/);
    });

    it("throttles a user past the per-window budget", () => {
      const user = "rate-limit-test-user";
      for (let i = 0; i < 10; i += 1) assertIntentRateLimit(user);
      expect(() => assertIntentRateLimit(user)).toThrow(/Too many payment attempts/);
    });
  });
});
