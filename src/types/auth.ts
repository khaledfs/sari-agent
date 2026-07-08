export type UserRole = "customer" | "admin";

export type RegisterInput = {
  businessName: string;
  email: string;
  phoneNumber: string;
  password: string;
};

export type VerifyInput = {
  phoneNumber: string;
  code: string;
};

export type LoginInput = {
  identifier: string; // email or phoneNumber
  password: string;
};
