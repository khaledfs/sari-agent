import mongoose, { isValidObjectId } from "mongoose";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { CustomerMemoryModel } from "@/models/customer-memory.model";
import { OrderModel } from "@/models/order.model";
import { UserModel } from "@/models/user.model";
import { CANCELLED_STATUS_RX } from "@/services/admin-overview.service";

/**
 * Admin reporting module. Mirrors the admin service style: requireAdmin per
 * request, validated inputs, capped result sets, thin routes. Metric rules
 * are SHARED with the overview dashboard (cancelled-like statuses excluded
 * via the same CANCELLED_STATUS_RX; revenue = order total, i.e. after the
 * promotion order-discount) so dashboard and reports always agree.
 */

export const REPORT_MAX_ROWS = 500;
const MAX_RANGE_DAYS = 365;

export type ReportRange = { from: Date; to: Date };

/** Pure date-range validator (exported for unit tests). Throws on invalid. */
export function validateDateRange(fromRaw: unknown, toRaw: unknown): ReportRange {
  if (!fromRaw || !toRaw) throw new Error("from and to are required.");
  const from = new Date(String(fromRaw));
  const to = new Date(String(toRaw));
  if (Number.isNaN(from.getTime())) throw new Error("Invalid from date.");
  if (Number.isNaN(to.getTime())) throw new Error("Invalid to date.");
  if (from.getTime() > to.getTime()) throw new Error("from must be before to.");
  const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_RANGE_DAYS) throw new Error(`Date range must be at most ${MAX_RANGE_DAYS} days.`);
  return { from, to };
}

/** CSV value escaping (RFC-4180 style). Pure — exported for unit tests. */
export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Manual CSV builder (no libraries). Pure — exported for unit tests. */
export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

/** "קמח לבן x2, שוקולד x5" — readable item join. Pure — exported for tests. */
export function joinOrderItems(items: Array<{ name: string; quantity: number; isGift?: boolean }>): string {
  return items.map((i) => `${i.isGift ? "🎁 " : ""}${i.name} x${i.quantity}`).join(", ");
}

type OrderLeanForReport = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items?: Array<{ name: string; quantity: number; lineTotal?: number; price: number; isGift?: boolean }>;
  total: number;
  status: string;
  createdAt?: Date;
  notes?: string;
  promotionDiscount?: { amountOff: number };
};

async function customerContext(userIds: mongoose.Types.ObjectId[]) {
  const [users, memories] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } }, { businessName: 1, phoneNumber: 1 }).lean().exec(),
    CustomerMemoryModel.find({ userId: { $in: userIds } })
      .select("userId businessType")
      .lean()
      .exec(),
  ]);
  return {
    userById: new Map(users.map((u) => [String(u._id), u])),
    typeByUser: new Map(memories.map((m) => [String(m.userId), m.businessType ?? ""])),
  };
}

// ---------------------------------------------------------------------------
// Report 1 — Orders (flat export-ready rows)
// ---------------------------------------------------------------------------

export type OrdersReportRow = {
  orderNumber: string;
  date: string;
  customerName: string;
  businessType: string;
  phone: string;
  items: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  notes: string;
};

export type ReportResult<T> = { rows: T[]; count: number; hasMore: boolean };

export async function getOrdersReport(params: {
  from: unknown;
  to: unknown;
  customerId?: string;
  status?: string;
}): Promise<ReportResult<OrdersReportRow>> {
  await requireAdmin();
  const { from, to } = validateDateRange(params.from, params.to);
  await connectDB();

  const filter: Record<string, unknown> = { createdAt: { $gte: from, $lte: to } };
  if (params.customerId?.trim()) {
    if (!isValidObjectId(params.customerId)) throw new Error("Invalid customerId.");
    filter.userId = new mongoose.Types.ObjectId(params.customerId);
  }
  if (params.status?.trim()) filter.status = params.status.trim().toLowerCase();

  const docs = (await OrderModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(REPORT_MAX_ROWS + 1)
    .lean()
    .exec()) as unknown as OrderLeanForReport[];

  const hasMore = docs.length > REPORT_MAX_ROWS;
  const page = docs.slice(0, REPORT_MAX_ROWS);
  const { userById, typeByUser } = await customerContext([...new Set(page.map((o) => o.userId))]);

  const rows: OrdersReportRow[] = page.map((o) => {
    const items = o.items ?? [];
    const paid = items.filter((i) => !i.isGift);
    const subtotal =
      Math.round(paid.reduce((n, i) => n + (i.lineTotal ?? i.price * i.quantity), 0) * 100) / 100;
    const user = userById.get(String(o.userId));
    return {
      orderNumber: String(o._id).slice(-8).toUpperCase(),
      date: o.createdAt ? new Date(o.createdAt).toISOString() : "",
      customerName: user?.businessName ?? "?",
      businessType: typeByUser.get(String(o.userId)) ?? "",
      phone: user?.phoneNumber ?? "",
      items: joinOrderItems(items),
      itemCount: items.reduce((n, i) => n + (Number.isFinite(i.quantity) ? i.quantity : 0), 0),
      subtotal,
      discount: o.promotionDiscount?.amountOff ?? 0,
      total: o.total,
      status: o.status,
      notes: o.notes ?? "",
    };
  });

  return { rows, count: rows.length, hasMore };
}

// ---------------------------------------------------------------------------
// Report 2 — Top products
// ---------------------------------------------------------------------------

export type TopProductRow = {
  name: string;
  sku: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
};

export async function getTopProductsReport(params: {
  from: unknown;
  to: unknown;
  limit?: number;
}): Promise<ReportResult<TopProductRow>> {
  await requireAdmin();
  const { from, to } = validateDateRange(params.from, params.to);
  const limit = Math.min(REPORT_MAX_ROWS, Math.max(1, Math.floor(params.limit ?? 20)));
  await connectDB();

  // Same shape as the overview top-products pipeline (gift lines excluded),
  // extended with revenue and distinct-order counts.
  const rows = await OrderModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    name: string;
    totalQty: number;
    totalRevenue: number;
    orderIds: mongoose.Types.ObjectId[];
  }>([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $not: CANCELLED_STATUS_RX } } },
    { $unwind: "$items" },
    { $match: { "items.isGift": { $ne: true } } },
    {
      $group: {
        _id: "$items.productId",
        name: { $last: "$items.name" },
        totalQty: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        orderIds: { $addToSet: "$_id" },
      },
    },
    { $sort: { totalQty: -1, totalRevenue: -1 } },
    { $limit: limit },
  ]).exec();

  // One lookup for sku/category of the returned products only.
  const { ProductModel } = await import("@/models/product.model");
  const products = await ProductModel.find(
    { _id: { $in: rows.map((r) => r._id) } },
    { sku: 1, category: 1 }
  )
    .lean()
    .exec();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  return {
    rows: rows.map((r) => {
      const p = productById.get(String(r._id));
      return {
        name: r.name ?? "?",
        sku: p?.sku ?? "",
        category: p?.category ?? "",
        totalQty: r.totalQty,
        totalRevenue: Math.round(r.totalRevenue * 100) / 100,
        orderCount: r.orderIds.length,
      };
    }),
    count: rows.length,
    hasMore: false,
  };
}

// ---------------------------------------------------------------------------
// Report 3 — Customer sales
// ---------------------------------------------------------------------------

export type CustomerSalesRow = {
  customerName: string;
  businessType: string;
  phone: string;
  orderCount: number;
  totalSpend: number;
  avgOrderValue: number;
  lastOrderDate: string;
};

export async function getCustomerSalesReport(params: {
  from: unknown;
  to: unknown;
}): Promise<ReportResult<CustomerSalesRow>> {
  await requireAdmin();
  const { from, to } = validateDateRange(params.from, params.to);
  await connectDB();

  const rows = await OrderModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    orderCount: number;
    totalSpend: number;
    lastOrderDate: Date;
  }>([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $not: CANCELLED_STATUS_RX } } },
    {
      $group: {
        _id: "$userId",
        orderCount: { $sum: 1 },
        totalSpend: { $sum: "$total" },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
    { $sort: { totalSpend: -1 } },
    { $limit: REPORT_MAX_ROWS + 1 },
  ]).exec();

  const hasMore = rows.length > REPORT_MAX_ROWS;
  const page = rows.slice(0, REPORT_MAX_ROWS);
  const { userById, typeByUser } = await customerContext(page.map((r) => r._id));

  return {
    rows: page.map((r) => {
      const user = userById.get(String(r._id));
      return {
        customerName: user?.businessName ?? "?",
        businessType: typeByUser.get(String(r._id)) ?? "",
        phone: user?.phoneNumber ?? "",
        orderCount: r.orderCount,
        totalSpend: Math.round(r.totalSpend * 100) / 100,
        avgOrderValue: r.orderCount ? Math.round((r.totalSpend / r.orderCount) * 100) / 100 : 0,
        lastOrderDate: r.lastOrderDate ? new Date(r.lastOrderDate).toISOString() : "",
      };
    }),
    count: page.length,
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export const REPORT_TYPES = ["orders", "top-products", "customer-sales"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Builds the CSV body (without BOM — the route prepends ﻿ for Excel). */
export async function buildReportCsv(type: ReportType, from: unknown, to: unknown): Promise<string> {
  if (type === "orders") {
    const { rows } = await getOrdersReport({ from, to });
    return buildCsv(
      ["orderNumber", "date", "customerName", "businessType", "phone", "items", "itemCount", "subtotal", "discount", "total", "status", "notes"],
      rows.map((r) => [r.orderNumber, r.date, r.customerName, r.businessType, r.phone, r.items, r.itemCount, r.subtotal, r.discount, r.total, r.status, r.notes])
    );
  }
  if (type === "top-products") {
    const { rows } = await getTopProductsReport({ from, to, limit: REPORT_MAX_ROWS });
    return buildCsv(
      ["name", "sku", "category", "totalQty", "totalRevenue", "orderCount"],
      rows.map((r) => [r.name, r.sku, r.category, r.totalQty, r.totalRevenue, r.orderCount])
    );
  }
  const { rows } = await getCustomerSalesReport({ from, to });
  return buildCsv(
    ["customerName", "businessType", "phone", "orderCount", "totalSpend", "avgOrderValue", "lastOrderDate"],
    rows.map((r) => [r.customerName, r.businessType, r.phone, r.orderCount, r.totalSpend, r.avgOrderValue, r.lastOrderDate])
  );
}
