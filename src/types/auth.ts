import type { BusinessOnboardingType } from "@/types/business-type";

export type UserRole = "customer" | "admin";

export type RegisterInput = {
  businessName: string;
  email: string;
  phoneNumber: string;
  password: string;
  businessType: BusinessOnboardingType;
};

export type VerifyInput = {
  phoneNumber: string;
  code: string;
};

export type LoginInput = {
  identifier: string; // email or phoneNumber
  password: string;
};
