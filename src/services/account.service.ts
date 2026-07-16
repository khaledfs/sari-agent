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

/**
 * Provisioning defaults. The former MOCK values (fabricated totalDebt 1280.5,
 * fake lastPaymentDate) were removed with the real ledger (Work Order Issue 8)
 * — CustomerAccount.balance/totalDebt/lastPaymentDate are legacy fields no
 * longer surfaced anywhere; financial truth lives in the ledger entries.
 */
function provisioningDefaults() {
  return {
    balance: 0,
    totalDebt: 0,
    lastPaymentDate: null as Date | null,
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

  const defaults = provisioningDefaults();
  doc = await CustomerAccountModel.create({
    userId: uid,
    businessName: user.businessName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    balance: defaults.balance,
    totalDebt: defaults.totalDebt,
    ...(defaults.lastPaymentDate ? { lastPaymentDate: defaults.lastPaymentDate } : {}),
  });

  return docToRecord(doc);
}

