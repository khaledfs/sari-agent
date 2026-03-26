export type SmsMode = "development" | "sandbox" | "production";

export type SmsPayload = {
  phoneNumber: string;
  message: string;
};
