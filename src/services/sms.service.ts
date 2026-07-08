import Twilio from "twilio";

import type { SmsMode, SmsPayload } from "@/types/sms";

function getSmsMode(): SmsMode {
  const mode = process.env.SMS_MODE ?? "development";
  if (mode === "development" || mode === "sandbox" || mode === "production") {
    return mode;
  }
  throw new Error(`Invalid SMS_MODE: ${mode}`);
}

function getTwilioClient() {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    throw new Error(
      "Twilio is not fully configured. Add TWILIO_SID, TWILIO_TOKEN, and TWILIO_PHONE_NUMBER."
    );
  }

  return { client: Twilio(sid, token), from };
}

export async function sendVerificationSMS(payload: SmsPayload) {
  const mode = getSmsMode();

  if (mode === "development") {
    console.log(`[SMS:development] To ${payload.phoneNumber} -> ${payload.message}`);
    return;
  }

  const { client, from } = getTwilioClient();
  await client.messages.create({
    to: payload.phoneNumber,
    from,
    body: payload.message,
  });
}
