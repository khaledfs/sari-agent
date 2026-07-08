import { VerificationCodeModel } from "@/models/verification-code.model";

const CODE_TTL_MS = 5 * 60 * 1000;

export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createVerificationCode(phoneNumber: string) {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await VerificationCodeModel.findOneAndUpdate(
    { phoneNumber },
    { code, expiresAt },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return { code, expiresAt };
}

export async function validateVerificationCode(phoneNumber: string, code: string) {
  const record = await VerificationCodeModel.findOne({ phoneNumber });
  if (!record) {
    return false;
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await VerificationCodeModel.deleteOne({ _id: record._id });
    return false;
  }

  const isValid = record.code === code;
  if (isValid) {
    await VerificationCodeModel.deleteOne({ _id: record._id });
  }

  return isValid;
}
