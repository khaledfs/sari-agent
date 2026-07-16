import mongoose, { isValidObjectId } from "mongoose";

import { resolveActorScope } from "@/lib/actor-scope";
import { assertRuleWithinScope } from "@/lib/admin-pricing";
import { connectDB } from "@/lib/db";
import { BANNER_SCOPES, BannerModel } from "@/models/banner.model";
import { CUSTOMER_MEMORY_BUSINESS_TYPES } from "@/models/customer-memory.model";
import { isValidBannerCtaHref } from "@/services/banners.service";

/** Admin CRUD + validation for customer banners. */

export type AdminBannerRow = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  scope: string;
  targetId: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
};

/** Pure banner-input validator (exported for unit tests). */
export function validateBannerInput(input: Record<string, unknown>): {
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  scope: string;
  targetId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  priority: number;
} {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Banner title is required.");

  const scope = String(input.scope ?? "");
  if (!(BANNER_SCOPES as readonly string[]).includes(scope)) {
    throw new Error("Invalid banner audience.");
  }
  const targetId = String(input.targetId ?? "").trim();
  if (scope === "customer" && !isValidObjectId(targetId)) {
    throw new Error("Customer-scoped banners need a valid customer id.");
  }
  if (scope === "businessType" && !(CUSTOMER_MEMORY_BUSINESS_TYPES as readonly string[]).includes(targetId)) {
    throw new Error("businessType-scoped banners need a valid business type.");
  }

  const ctaHref = String(input.ctaHref ?? "").trim();
  if (!isValidBannerCtaHref(ctaHref)) {
    throw new Error('ctaHref must be an internal path starting with "/".');
  }

  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : null;
  const endsAt = input.endsAt ? new Date(String(input.endsAt)) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Invalid startsAt date.");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("Invalid endsAt date.");
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("endsAt must be after startsAt.");
  }

  const priority = Number(input.priority ?? 0);
  if (!Number.isFinite(priority)) throw new Error("Priority must be a number.");

  return {
    title,
    body: String(input.body ?? "").trim(),
    imageUrl: String(input.imageUrl ?? "").trim(),
    ctaLabel: String(input.ctaLabel ?? "").trim(),
    ctaHref,
    scope,
    targetId: scope === "global" ? "" : targetId,
    startsAt,
    endsAt,
    isActive: input.isActive !== false,
    priority,
  };
}

type BannerLeanDoc = {
  _id: mongoose.Types.ObjectId;
  title: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  scope: string;
  targetId?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
  priority?: number;
};

function toRow(d: BannerLeanDoc): AdminBannerRow {
  return {
    id: String(d._id),
    title: d.title,
    body: d.body ?? "",
    imageUrl: d.imageUrl ?? "",
    ctaLabel: d.ctaLabel ?? "",
    ctaHref: d.ctaHref ?? "",
    scope: d.scope,
    targetId: d.targetId ?? "",
    startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    isActive: d.isActive !== false,
    priority: d.priority ?? 0,
  };
}

export async function listAdminBanners(): Promise<AdminBannerRow[]> {
  const scope = await resolveActorScope();
  await connectDB();
  // Task D: agents see only banners targeted at THEIR customers.
  const filter =
    scope.role === "admin" ? {} : { scope: "customer", targetId: { $in: scope.customerIds } };
  const docs = (await BannerModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()
    .exec()) as unknown as BannerLeanDoc[];
  return docs.map(toRow);
}

export async function createAdminBanner(input: Record<string, unknown>): Promise<AdminBannerRow> {
  const scope = await resolveActorScope();
  const doc = validateBannerInput(input);
  // Global/businessType audiences are admin-only; agents may target only
  // their own customers (Task D).
  assertRuleWithinScope(scope, doc.scope, doc.targetId);
  await connectDB();
  const created = await BannerModel.create(doc);
  return toRow(created.toObject() as unknown as BannerLeanDoc);
}

export async function updateAdminBanner(
  bannerId: string,
  patch: Record<string, unknown>
): Promise<AdminBannerRow> {
  const scope = await resolveActorScope();
  if (!isValidObjectId(bannerId)) throw new Error("Banner not found.");

  await connectDB();
  const existing = (await BannerModel.findById(bannerId).lean().exec()) as unknown as BannerLeanDoc | null;
  if (!existing) throw new Error("Banner not found.");
  if (scope.role !== "admin") {
    if (existing.scope !== "customer" || !scope.customerIds.includes(existing.targetId ?? "")) {
      throw new Error("Banner not found.");
    }
  }

  const merged = validateBannerInput({
    title: patch.title !== undefined ? patch.title : existing.title,
    body: patch.body !== undefined ? patch.body : existing.body,
    imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
    ctaLabel: patch.ctaLabel !== undefined ? patch.ctaLabel : existing.ctaLabel,
    ctaHref: patch.ctaHref !== undefined ? patch.ctaHref : existing.ctaHref,
    scope: patch.scope !== undefined ? patch.scope : existing.scope,
    targetId: patch.targetId !== undefined ? patch.targetId : existing.targetId,
    startsAt: patch.startsAt !== undefined ? patch.startsAt : existing.startsAt?.toISOString() ?? null,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : existing.endsAt?.toISOString() ?? null,
    isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
    priority: patch.priority !== undefined ? patch.priority : existing.priority,
  });

  assertRuleWithinScope(scope, merged.scope, merged.targetId);
  await BannerModel.updateOne({ _id: bannerId }, { $set: merged }).exec();
  const updated = (await BannerModel.findById(bannerId).lean().exec()) as unknown as BannerLeanDoc;
  return toRow(updated);
}
