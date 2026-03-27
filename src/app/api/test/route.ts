import { pingDatabase } from "@/services/health.service";

export async function GET() {
  await pingDatabase();
  return Response.json({ success: true });
}