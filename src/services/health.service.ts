import { connectDB } from "@/lib/db";

export async function pingDatabase() {
  await connectDB();
  return true;
}

