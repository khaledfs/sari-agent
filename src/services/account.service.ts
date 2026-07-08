import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CustomerAccountModel } from "@/models/customer-account.model";
import { UserModel } from "@/models/user.model";

export type AccountRecord = {
  businessName: string;
  phoneNumber: string;
  email: string;
  balance: number;
  totalDebt: number;
  lastPaymentDate: Date | null;
};

export type MockPaymentRow = {
  date: string;
  amount: number;
};

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

function docToRecord(doc: {
  businessName: string;
  phoneNumber: string;
  email: string;
  balance: number;
  totalDebt: number;
  lastPaymentDate?: Date | null;
}): AccountRecord {
  return {
    businessName: doc.businessName,
    phoneNumber: doc.phoneNumber,
    email: doc.email,
    balance: doc.balance,
    totalDebt: doc.totalDebt,
    lastPaymentDate: doc.lastPaymentDate ?? null,
  };
}

/** Mock financial defaults when provisioning a new account from User. */
function mockFinancialDefaults() {
  const lastPaymentDate = new Date();
  lastPaymentDate.setDate(lastPaymentDate.getDate() - 12);
  return {
    balance: 0,
    totalDebt: 1280.5,
    lastPaymentDate,
  };
}

/**
 * Returns the customer account for the user, creating one from User if missing.
 */
export async function getAccountByUser(userId: string): Promise<AccountRecord> {
  const uid = toUserObjectId(userId);
  await connectDB();

  let doc = await CustomerAccountModel.findOne({ userId: uid }).exec();
  if (doc) {
    return docToRecord(doc);
  }

  const user = await UserModel.findById(uid).lean().exec();
  if (!user) {
    throw new Error("User not found.");
  }

  const mock = mockFinancialDefaults();
  doc = await CustomerAccountModel.create({
    userId: uid,
    businessName: user.businessName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    balance: mock.balance,
    totalDebt: mock.totalDebt,
    lastPaymentDate: mock.lastPaymentDate,
  });

  return docToRecord(doc);
}

/**
 * Mock payment rows for UI; structure is ready to swap for a real data source later.
 * `userId` is accepted so future implementations can scope data per user without API changes.
 */
export function getMockPaymentsByUser(userId: string): MockPaymentRow[] {
  if (!isValidObjectId(userId)) {
    return [];
  }
  const base = userId.slice(-4);
  const n = parseInt(base, 16) || 0;
  const offset = n % 50;

  const d1 = new Date();
  d1.setDate(d1.getDate() - 5);
  const d2 = new Date();
  d2.setDate(d2.getDate() - 18);
  const d3 = new Date();
  d3.setDate(d3.getDate() - 44);

  return [
    { date: d1.toISOString(), amount: Math.round((420 + offset) * 100) / 100 },
    { date: d2.toISOString(), amount: Math.round((150 + offset / 2) * 100) / 100 },
    { date: d3.toISOString(), amount: Math.round((980 - offset) * 100) / 100 },
  ];
}

