import bcrypt from "bcryptjs";

import { connectDB } from "@/lib/db";
import {
  isStrongPassword,
  isValidEmail,
  normalizeIsraeliPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/validators";
import { UserModel } from "@/models/user.model";
import { sendVerificationSMS } from "@/services/sms.service";
import {
  createVerificationCode,
  validateVerificationCode,
} from "@/services/verification.service";
import type { RegisterInput, VerifyInput } from "@/types/auth";
import { signAuthToken } from "@/lib/jwt";

export async function registerCustomer(input: RegisterInput) {
  const businessName = input.businessName.trim();
  const email = input.email.trim().toLowerCase();
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const password = input.password;

  if (!businessName || !email || !phoneNumber || !password) {
    throw new Error("Missing required fields.");
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

  await UserModel.create({
    businessName,
    email,
    phoneNumber,
    password: hashedPassword,
    role: "customer",
    isVerified: false,
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

  const userId = String((user as { _id: unknown })._id);
  const token = signAuthToken({ userId, role: user.role });
  return { success: true, token };
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

  if (user.role !== "admin") {
    throw new Error("Access denied.");
  }

  const userId = String((user as { _id: unknown })._id);
  const token = signAuthToken({ userId, role: user.role });
  return { success: true, token };
}
