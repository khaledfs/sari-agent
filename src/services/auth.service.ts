import bcrypt from "bcryptjs";

import { connectDB } from "@/lib/db";
import {
  isStrongPassword,
  isValidEmail,
  normalizeIsraeliPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/validators";
import { CustomerAccountModel } from "@/models/customer-account.model";
import {
  CustomerMemoryModel,
  type CustomerMemoryBusinessType,
} from "@/models/customer-memory.model";
import { UserModel } from "@/models/user.model";
import { sendVerificationSMS } from "@/services/sms.service";
import {
  createVerificationCode,
  validateVerificationCode,
} from "@/services/verification.service";
import type { RegisterInput, VerifyInput } from "@/types/auth";
import { BUSINESS_ONBOARDING_TYPES, type BusinessOnboardingType } from "@/types/business-type";
import { signAuthToken } from "@/lib/jwt";

const BUSINESS_TYPE_TO_MEMORY_TYPE: Record<BusinessOnboardingType, CustomerMemoryBusinessType> = {
  bakery: "bakery",
  eastern_sweets: "oriental_sweets",
  western_sweets_pastry: "western_sweets",
  cafe: "cafe",
  ice_cream_shop: "ice_cream",
};

export async function registerCustomer(input: RegisterInput) {
  const businessName = input.businessName.trim();
  const email = input.email.trim().toLowerCase();
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const password = input.password;
  const businessType = input.businessType;

  if (!businessName || !email || !phoneNumber || !password || !businessType) {
    throw new Error("Missing required fields.");
  }

  if (!BUSINESS_ONBOARDING_TYPES.includes(businessType)) {
    throw new Error("Invalid business type.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Invalid email format.");
  }

  if (!isStrongPassword(password)) {
    throw new Error(
      "Password must be at least 8 characters and include uppercase, lowercase, and number."
    );
  }

  await connectDB();

  const existingUser = await UserModel.findOne({
    $or: [{ email }, { phoneNumber }],
  }).lean();

  if (existingUser) {
    throw new Error("User already exists with this email or phone number.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const createdUser = await UserModel.create({
    businessName,
    email,
    phoneNumber,
    password: hashedPassword,
    role: "customer",
    isVerified: false,
  });

  await CustomerAccountModel.create({
    userId: createdUser._id,
    businessName,
    email,
    phoneNumber,
    businessType,
  });

  await CustomerMemoryModel.create({
    userId: createdUser._id,
    businessType: BUSINESS_TYPE_TO_MEMORY_TYPE[businessType],
  });

  const { code } = await createVerificationCode(phoneNumber);
  await sendVerificationSMS({
    phoneNumber,
    message: `Your verification code is: ${code}`,
  });

  return { success: true };
}

export async function verifyCustomerPhone(input: VerifyInput) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const code = input.code.trim();

  if (!phoneNumber || !code) {
    throw new Error("Phone number and code are required.");
  }

  await connectDB();

  const isValidCode = await validateVerificationCode(phoneNumber, code);
  if (!isValidCode) {
    throw new Error("Invalid or expired verification code.");
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    { phoneNumber },
    { isVerified: true },
    { returnDocument: "after" }
  ).lean();

  if (!updatedUser) {
    throw new Error("User not found.");
  }

  return { success: true };
}

export async function loginWithPassword(input: { identifier: string; password: string }) {
  const identifier = input.identifier.trim();
  const password = input.password;

  if (!identifier || !password) {
    throw new Error("Identifier and password are required.");
  }

  await connectDB();

  const isEmail = identifier.includes("@");
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { phoneNumber: normalizeIsraeliPhoneNumber(identifier) };

  const user = await UserModel.findOne(query).lean();
  if (!user) {
    throw new Error("Invalid credentials.");
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw new Error("Invalid credentials.");
  }

  if (!user.isVerified) {
    throw new Error("Phone number is not verified.");
  }

  // NOTE (Work Order Issue 3): the former isActive login rejection was removed
  // deliberately. A restricted customer is a commercial hold, not a security
  // ban — they stay logged in with read access and are blocked server-side
  // from ordering by requireOrderingEnabled() instead.

  const userId = String((user as { _id: unknown })._id);
  const token = signAuthToken({ userId, role: user.role });
  return { success: true, token };
}

export async function changeAdminPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  if (!currentPassword || !newPassword) {
    throw new Error("Current password and new password are required.");
  }

  if (!isStrongPassword(newPassword)) {
    throw new Error(
      "Password must be at least 8 characters and include uppercase, lowercase, and number."
    );
  }

  await connectDB();

  const user = await UserModel.findById(userId);
  if (!user || user.role !== "admin") {
    throw new Error("Access denied.");
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    throw new Error("Current password is incorrect.");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return { success: true };
}

export async function loginAdmin(input: { identifier: string; password: string }) {
  const identifier = input.identifier.trim();
  const password = input.password;

  if (!identifier || !password) {
    throw new Error("Identifier and password are required.");
  }

  await connectDB();

  const isEmail = identifier.includes("@");
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { phoneNumber: normalizeIsraeliPhoneNumber(identifier) };

  const user = await UserModel.findOne(query).lean();
  if (!user) {
    throw new Error("Invalid credentials.");
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw new Error("Invalid credentials.");
  }

  // The admin console is shared by admins and field AGENTS (Task D) — agents
  // get in and are scoped server-side on every request; customers do not.
  if (user.role !== "admin" && user.role !== "agent") {
    throw new Error("Access denied.");
  }
  // A removed (fired) agent can no longer sign in — the account is soft-retired,
  // not deleted. Same "Access denied." the per-request scope resolver returns.
  if (user.role === "agent" && (user as { agentStatus?: string }).agentStatus === "removed") {
    throw new Error("Access denied.");
  }

  const userId = String((user as { _id: unknown })._id);
  const token = signAuthToken({ userId, role: user.role });
  return { success: true, token };
}
