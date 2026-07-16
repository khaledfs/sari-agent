import mongoose, { isValidObjectId } from "mongoose";

import { getCustomerPricingSummary, type CustomerPricingSummary } from "@/lib/admin-pricing";
import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { OrderModel } from "@/models/order.model";
import { PromotionModel } from "@/models/promotion.model";
import { UserModel } from "@/models/user.model";
import { resolveAccountStatus, type AccountStatus } from "@/services/account-status.service";
import { CANCELLED_STATUS_RX } from "@/services/admin-overview.service";
import { publishRealtimeEvent } from "@/services/event-bus.service";

/**
 * Admin customer CRM, mirroring admin-orders/admin-products: requireAdmin per
 * request, plain Error messages mapped in thin routes, paginated lists, and
 * whitelist-only updates. Exposes existing data; changes no business logic.
 */

export type AdminCustomerRow = {
  id: string;
  businessName: string;
  email: string;
  phoneNumber: string;
  businessType: string | null;
  isVerified: boolean;
  /** Ordering permission — replaces the former isActive soft-disable (Issue 3). */
  accountStatus: AccountStatus;
  restrictedAt: string | null;
  restrictedReason: string;
  createdAt: string;
  totalOrders: number;
  lifetimeSpend: number;
  lastOrderDate: string | null;
};

export type AdminCustomerListResult = {
  items: AdminCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminCustomerProfile = {
  customer: AdminCustomerRow & { adminNotes: string };
  analytics: {
    totalOrders: number;
    lifetimeSpend: number;
    avgOrderValue: number;
    lastOrderDate: string | null;
  };
  recentOrders: Array<{
    id: string;
    createdAt: string;
    status: string;
    itemCount: number;
    total: number;
    notes: string;
  }>;
  memory: {
    businessType: string | null;
    memorySummary: string;
    conversationCount: number;
    preferredCategories: string[];
    avoidedProducts: string[];
    notedFacts: string[];
  } | null;
  pricing: CustomerPricingSummary;
  promotions: Array<{ id: string; label: string; kind: string; scope: string }>;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;
export const ADMIN_NOTES_MAX_LENGTH = 1000;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type UserLean = {
  _id: mongoose.Types.ObjectId;
  businessName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  isActive?: boolean;
  accountStatus?: string;
  restrictedAt?: Date;
  restrictedReason?: string;
  adminNotes?: string;
  createdAt?: Date;
};

/**
 * Mongo filter matching the effective "restricted" state including legacy
 * documents (no accountStatus yet, old isActive=false soft-disable).
 */
const RESTRICTED_DB_FILTER = {
  $or: [
    { accountStatus: "restricted" },
    { accountStatus: { $exists: false }, isActive: false },
  ],
};

type OrderStats = {
  totalOrders: number;
  lifetimeSpend: number;
  lastOrderDate: Date | null;
};

/**
 * One aggregation for the whole page of customers (no N+1). Revenue rules
 * match the overview dashboard: cancelled-like statuses excluded from spend.
 */
async function orderStatsFor(userIds: mongoose.Types.ObjectId[]): Promise<Map<string, OrderStats>> {
  if (userIds.length === 0) return new Map();
  const rows = await OrderModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalOrders: number;
    lifetimeSpend: number;
    lastOrderDate: Date;
  }>([
    { $match: { userId: { $in: userIds }, status: { $not: CANCELLED_STATUS_RX } } },
    {
      $group: {
        _id: "$userId",
        totalOrders: { $sum: 1 },
        lifetimeSpend: { $sum: "$total" },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
  ]).exec();
  return new Map(
    rows.map((r) => [
      String(r._id),
      {
        totalOrders: r.totalOrders,
        lifetimeSpend: Math.round(r.lifetimeSpend * 100) / 100,
        lastOrderDate: r.lastOrderDate ?? null,
      },
    ])
  );
}

function toRow(
  u: UserLean,
  businessType: string | null,
  stats: OrderStats | undefined
): AdminCustomerRow {
  return {
    id: String(u._id),
    businessName: u.businessName,
    email: u.email,
    phoneNumber: u.phoneNumber,
    businessType,
    isVerified: u.isVerified,
    accountStatus: resolveAccountStatus(u),
    restrictedAt: u.restrictedAt instanceof Date ? u.restrictedAt.toISOString() : null,
    restrictedReason: u.restrictedReason ?? "",
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt ?? ""),
    totalOrders: stats?.totalOrders ?? 0,
    lifetimeSpend: stats?.lifetimeSpend ?? 0,
    lastOrderDate: stats?.lastOrderDate ? stats.lastOrderDate.toISOString() : null,
  };
}

export async function listAdminCustomers(
  params: {
    search?: string;
    businessType?: string;
    active?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<AdminCustomerListResult> {
  await requireAdmin();
  await connectDB();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));

  const filter: Record<string, unknown> = { role: "customer" };

  const search = params.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ businessName: rx }, { phoneNumber: rx }, { email: rx }];
  }
  // Ordering-state filter over the effective status (legacy docs included).
  if (params.active === "active") filter.$nor = [RESTRICTED_DB_FILTER];
  else if (params.active === "restricted" || params.active === "inactive") {
    filter.$and = [RESTRICTED_DB_FILTER];
  }

  // businessType lives on CustomerMemory — resolve matching userIds first.
  const businessType = params.businessType?.trim();
  if (businessType) {
    const memories = await CustomerMemoryModel.find({ businessType }).select("userId").lean().exec();
    filter._id = { $in: memories.map((m) => m.userId) };
  }

  const [total, users] = await Promise.all([
    UserModel.countDocuments(filter).exec(),
    UserModel.find(filter, { password: 0 })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .exec() as unknown as Promise<UserLean[]>,
  ]);

  const userIds = users.map((u) => u._id);
  const [stats, memories] = await Promise.all([
    orderStatsFor(userIds),
    CustomerMemoryModel.find({ userId: { $in: userIds } })
      .select("userId businessType")
      .lean()
      .exec(),
  ]);
  const typeByUser = new Map(memories.map((m) => [String(m.userId), m.businessType ?? null]));

  return {
    items: users.map((u) => toRow(u, typeByUser.get(String(u._id)) ?? null, stats.get(String(u._id)))),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminCustomer(customerId: string): Promise<AdminCustomerProfile> {
  await requireAdmin();
  if (!isValidObjectId(customerId)) throw new Error("Customer not found.");
  await connectDB();

  const user = (await UserModel.findOne({ _id: customerId, role: "customer" }, { password: 0 })
    .lean()
    .exec()) as unknown as UserLean | null;
  if (!user) throw new Error("Customer not found.");

  const uid = user._id;
  const [stats, memory, recentOrdersRaw, pricing, promotions] = await Promise.all([
    orderStatsFor([uid]),
    CustomerMemoryModel.findOne({ userId: uid }).lean().exec(),
    OrderModel.find({ userId: uid }, { items: 1, total: 1, status: 1, createdAt: 1, notes: 1 })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec(),
    getCustomerPricingSummary(customerId),
    PromotionModel.find({
      isActive: true,
      $or: [{ scope: "global" }, { scope: "customer", targetId: customerId }],
    })
      .select("label kind scope")
      .limit(50)
      .lean()
      .exec(),
  ]);

  const s = stats.get(String(uid));
  const businessType = memory?.businessType ?? null;

  // businessType-targeted promotions need the memory type (second short query
  // only when the customer has a type).
  let typePromotions: typeof promotions = [];
  if (businessType) {
    typePromotions = await PromotionModel.find({
      isActive: true,
      scope: "businessType",
      targetId: businessType,
    })
      .select("label kind scope")
      .limit(50)
      .lean()
      .exec();
  }

  return {
    customer: {
      ...toRow(user, businessType, s),
      adminNotes: user.adminNotes ?? "",
    },
    analytics: {
      totalOrders: s?.totalOrders ?? 0,
      lifetimeSpend: s?.lifetimeSpend ?? 0,
      avgOrderValue: s?.totalOrders ? Math.round((s.lifetimeSpend / s.totalOrders) * 100) / 100 : 0,
      lastOrderDate: s?.lastOrderDate ? s.lastOrderDate.toISOString() : null,
    },
    recentOrders: (recentOrdersRaw as Array<{
      _id: mongoose.Types.ObjectId;
      items?: Array<{ quantity: number }>;
      total: number;
      status: string;
      createdAt?: Date;
      notes?: string;
    }>).map((o) => ({
      id: String(o._id),
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : "",
      status: o.status,
      itemCount: (o.items ?? []).reduce((n, i) => n + (Number.isFinite(i.quantity) ? i.quantity : 0), 0),
      total: o.total,
      notes: o.notes ?? "",
    })),
    memory: memory
      ? {
          businessType,
          memorySummary: memory.memorySummary ?? "",
          conversationCount: memory.conversationCount ?? 0,
          preferredCategories: memory.inferredPreferences?.preferredCategories ?? [],
          avoidedProducts: memory.inferredPreferences?.avoidedProducts ?? [],
          notedFacts: memory.inferredPreferences?.notedFacts ?? [],
        }
      : null,
    pricing,
    promotions: [...promotions, ...typePromotions].map((p) => ({
      id: String((p as { _id: unknown })._id),
      label: (p as { label?: string }).label ?? "",
      kind: (p as { kind: string }).kind,
      scope: (p as { scope: string }).scope,
    })),
  };
}

export const RESTRICTED_REASON_MAX_LENGTH = 500;

/**
 * Whitelist-only update: accountStatus (ordering hold — replaces the former
 * isActive soft-disable), restrictedReason, and adminNotes. Nothing else.
 * Emits account.restricted / account.unrestricted after a real status change.
 */
export async function updateAdminCustomer(
  customerId: string,
  patch: Record<string, unknown>
): Promise<AdminCustomerProfile> {
  await requireAdmin();
  if (!isValidObjectId(customerId)) throw new Error("Customer not found.");

  const keys = Object.keys(patch ?? {});
  if (keys.length === 0) throw new Error("At least one field is required for update.");

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, unknown> = {};
  let nextStatus: AccountStatus | null = null;
  for (const key of keys) {
    if (key === "accountStatus") {
      if (patch.accountStatus !== "active" && patch.accountStatus !== "restricted") {
        throw new Error('accountStatus must be "active" or "restricted".');
      }
      nextStatus = patch.accountStatus;
      $set.accountStatus = nextStatus;
    } else if (key === "restrictedReason") {
      if (typeof patch.restrictedReason !== "string") {
        throw new Error("restrictedReason must be a string.");
      }
      if (patch.restrictedReason.length > RESTRICTED_REASON_MAX_LENGTH) {
        throw new Error(`restrictedReason must be at most ${RESTRICTED_REASON_MAX_LENGTH} characters.`);
      }
      $set.restrictedReason = patch.restrictedReason.trim();
    } else if (key === "adminNotes") {
      if (typeof patch.adminNotes !== "string") throw new Error("adminNotes must be a string.");
      if (patch.adminNotes.length > ADMIN_NOTES_MAX_LENGTH) {
        throw new Error(`adminNotes must be at most ${ADMIN_NOTES_MAX_LENGTH} characters.`);
      }
      $set.adminNotes = patch.adminNotes; // formatting preserved as-is
    } else {
      throw new Error(`Field "${key}" cannot be updated.`);
    }
  }

  await connectDB();

  const previous = (await UserModel.findOne(
    { _id: customerId, role: "customer" },
    { accountStatus: 1, isActive: 1 }
  )
    .lean()
    .exec()) as UserLean | null;
  if (!previous) throw new Error("Customer not found.");
  const previousStatus = resolveAccountStatus(previous);

  if (nextStatus === "restricted" && previousStatus !== "restricted") {
    $set.restrictedAt = new Date();
  } else if (nextStatus === "active") {
    $unset.restrictedAt = "";
    if (!("restrictedReason" in $set)) $unset.restrictedReason = "";
  }

  const update: Record<string, unknown> = { $set };
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  const res = await UserModel.updateOne({ _id: customerId, role: "customer" }, update).exec();
  if (res.matchedCount === 0) throw new Error("Customer not found.");

  // Realtime AFTER the successful write, only on a real transition.
  if (nextStatus && nextStatus !== previousStatus) {
    publishRealtimeEvent({
      type: nextStatus === "restricted" ? "account.restricted" : "account.unrestricted",
      userId: customerId,
    });
  }

  return getAdminCustomer(customerId);
}
