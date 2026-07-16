import mongoose from "mongoose";

import { resolveActorScope, scopedCustomerObjectIds } from "@/lib/actor-scope";
import { connectDB } from "@/lib/db";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { UserModel } from "@/models/user.model";

/**
 * Admin overview aggregations. One payload for the whole page (single round
 * trip from the client); every pipeline capped with sensible limits.
 */

export type OverviewPeriodStats = { revenue: number; orderCount: number };

export type AdminOverview = {
  revenue: {
    today: OverviewPeriodStats;
    last7d: OverviewPeriodStats;
    last30d: OverviewPeriodStats;
  };
  topProducts: Array<{ productId: string; name: string; quantity: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
  lowStock: Array<{
    id: string;
    name: string;
    sku: string;
    stock: number;
    lowStockThreshold: number;
  }>;
  newestCustomers: Array<{
    id: string;
    businessName: string;
    phoneNumber: string;
    createdAt: string;
  }>;
  weeklyRevenue: Array<{ weekStart: string; revenue: number }>;
};

/**
 * Which order statuses count toward revenue: everything except cancelled-like
 * states (an order is revenue once placed — pending/confirmed/packed/
 * out_for_delivery/delivered — and stops counting only when cancelled). Pure.
 */
export function isRevenueCountedStatus(status: string): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return !["cancel", "fail", "reject", "refund", "return", "void"].some((k) => s.includes(k));
}

/** Statuses excluded from revenue, as a Mongo-friendly regex (shared with reports/CRM). */
export const CANCELLED_STATUS_RX = /cancel|fail|reject|refund|return|void/i;
const CANCELLED_RX = CANCELLED_STATUS_RX;

/** Start-of-day (local server time). Pure. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The 8 week-start dates (Monday, local time) ending with the current week,
 * oldest first. Pure — unit-tested date bucketing for the sparkline.
 */
export function lastEightWeekStarts(now: Date): Date[] {
  const day = startOfDay(now);
  // Monday-based: getDay() Sunday=0 … Saturday=6 → days since Monday.
  const sinceMonday = (day.getDay() + 6) % 7;
  const currentWeekStart = new Date(day);
  currentWeekStart.setDate(day.getDate() - sinceMonday);
  const starts: Date[] = [];
  for (let i = 7; i >= 0; i -= 1) {
    const d = new Date(currentWeekStart);
    d.setDate(currentWeekStart.getDate() - i * 7);
    starts.push(d);
  }
  return starts;
}

/** Index of the week bucket a date belongs to, or -1 when out of range. Pure. */
export function weekBucketIndex(date: Date, weekStarts: Date[]): number {
  for (let i = weekStarts.length - 1; i >= 0; i -= 1) {
    if (date >= weekStarts[i]) {
      return i;
    }
  }
  return -1;
}

/** Low-stock predicate: tracked stock at/below its threshold. Pure. */
export function isLowStock(stock: number | null | undefined, threshold: number): boolean {
  return typeof stock === "number" && stock <= threshold;
}

async function periodStats(since: Date, scopeMatch: Record<string, unknown>): Promise<OverviewPeriodStats> {
  const rows = await OrderModel.aggregate<{ _id: null; revenue: number; orderCount: number }>([
    { $match: { ...scopeMatch, createdAt: { $gte: since }, status: { $not: CANCELLED_RX } } },
    { $group: { _id: null, revenue: { $sum: "$total" }, orderCount: { $sum: 1 } } },
  ]).exec();
  const row = rows[0];
  return {
    revenue: Math.round((row?.revenue ?? 0) * 100) / 100,
    orderCount: row?.orderCount ?? 0,
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  // Task D: an agent's overview is computed over THEIR customers only —
  // revenue, top products, status mix, newest customers, weekly buckets.
  // Low-stock stays catalog-level (product reads are allowed to agents).
  const scope = await resolveActorScope();
  await connectDB();
  const scopedIds = scopedCustomerObjectIds(scope);
  const scopeMatch: Record<string, unknown> = scopedIds ? { userId: { $in: scopedIds } } : {};

  const now = new Date();
  const todayStart = startOfDay(now);
  const d7 = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const d30 = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
  const weekStarts = lastEightWeekStarts(now);

  const [today, last7d, last30d, topProductsRaw, statusRows, lowStockRaw, newestRaw, weeklyOrders] =
    await Promise.all([
      periodStats(todayStart, scopeMatch),
      periodStats(d7, scopeMatch),
      periodStats(d30, scopeMatch),
      // Top 10 products by 30d PAID quantity (gift lines excluded).
      OrderModel.aggregate<{ _id: mongoose.Types.ObjectId; name: string; quantity: number }>([
        { $match: { ...scopeMatch, createdAt: { $gte: d30 }, status: { $not: CANCELLED_RX } } },
        { $unwind: "$items" },
        { $match: { "items.isGift": { $ne: true } } },
        {
          $group: {
            _id: "$items.productId",
            name: { $last: "$items.name" },
            quantity: { $sum: "$items.quantity" },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
      ]).exec(),
      OrderModel.aggregate<{ _id: string; count: number }>([
        ...(scopedIds ? [{ $match: scopeMatch }] : []),
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]).exec(),
      ProductModel.find({ stock: { $ne: null }, $expr: { $lte: ["$stock", "$lowStockThreshold"] } })
        .select("name sku stock lowStockThreshold")
        .sort({ stock: 1 })
        .limit(10)
        .lean()
        .exec(),
      UserModel.find(
        scopedIds ? { role: "customer", _id: { $in: scopedIds } } : { role: "customer" },
        { businessName: 1, phoneNumber: 1, createdAt: 1 }
      )
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec(),
      OrderModel.find(
        { ...scopeMatch, createdAt: { $gte: weekStarts[0] }, status: { $not: CANCELLED_RX } },
        { total: 1, createdAt: 1 }
      )
        .limit(5000)
        .lean()
        .exec(),
    ]);

  const weeklyRevenue = weekStarts.map((weekStart) => ({
    weekStart: weekStart.toISOString(),
    revenue: 0,
  }));
  for (const order of weeklyOrders) {
    const created = order.createdAt instanceof Date ? order.createdAt : new Date(String(order.createdAt));
    const idx = weekBucketIndex(created, weekStarts);
    if (idx >= 0) {
      weeklyRevenue[idx].revenue = Math.round((weeklyRevenue[idx].revenue + (order.total ?? 0)) * 100) / 100;
    }
  }

  return {
    revenue: { today, last7d, last30d },
    topProducts: topProductsRaw.map((p) => ({
      productId: String(p._id),
      name: p.name ?? "?",
      quantity: p.quantity,
    })),
    ordersByStatus: statusRows.map((s) => ({ status: s._id ?? "?", count: s.count })),
    lowStock: (lowStockRaw as Array<{
      _id: unknown;
      name: string;
      sku: string;
      stock: number;
      lowStockThreshold?: number;
    }>).map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold ?? 10,
    })),
    newestCustomers: (newestRaw as Array<{
      _id: unknown;
      businessName: string;
      phoneNumber: string;
      createdAt?: Date;
    }>).map((c) => ({
      id: String(c._id),
      businessName: c.businessName,
      phoneNumber: c.phoneNumber,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : "",
    })),
    weeklyRevenue,
  };
}
