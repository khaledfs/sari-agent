import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";

export type AdminCustomerRow = {
  _id: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  createdAt: string;
};

export async function listAdminCustomers(): Promise<AdminCustomerRow[]> {
  await requireAdmin();
  await connectDB();

  const customers = await UserModel.find(
    { role: "customer" },
    { password: 0 },
  )
    .sort({ createdAt: -1 })
    .lean();

  return customers.map((c) => ({
    _id: String(c._id),
    businessName: c.businessName,
    email: c.email,
    phoneNumber: c.phoneNumber,
    isVerified: c.isVerified,
    createdAt:
      c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  }));
}
