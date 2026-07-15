import { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { BannerModel, type BannerScope } from "@/models/banner.model";
import { CustomerMemoryModel } from "@/models/customer-memory.model";

/** Customer-facing banners: audience + date filtered, priority sorted, max 3. */

export const MAX_ACTIVE_BANNERS = 3;

export type BannerLike = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  scope: BannerScope;
  targetId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  priority: number;
};

export type BannerAudienceContext = {
  userId: string | null;
  businessType: string | null;
  now?: Date;
};

export type CustomerBanner = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  priority: number;
};

/** Audience + date-window + isActive filter. Pure. */
export function bannerApplies(banner: BannerLike, ctx: BannerAudienceContext): boolean {
  if (banner.isActive === false) return false;

  const now = ctx.now ?? new Date();
  if (banner.startsAt && now < banner.startsAt) return false;
  if (banner.endsAt && now > banner.endsAt) return false;

  if (banner.scope === "customer") {
    return Boolean(ctx.userId) && String(banner.targetId ?? "") === String(ctx.userId);
  }
  if (banner.scope === "businessType") {
    return Boolean(ctx.businessType) && String(banner.targetId ?? "") === ctx.businessType;
  }
  return true; // global
}

/** Priority sort (desc, id asc tiebreak for determinism) + max-3 cap. Pure. */
export function selectActiveBanners(banners: BannerLike[], ctx: BannerAudienceContext): CustomerBanner[] {
  return banners
    .filter((b) => bannerApplies(b, ctx))
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_ACTIVE_BANNERS)
    .map((b) => ({
      id: b.id,
      title: b.title,
      body: b.body,
      imageUrl: b.imageUrl,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      priority: b.priority,
    }));
}

/** Internal-path CTA guard (open-redirect prevention). Pure. */
export function isValidBannerCtaHref(ctaHref: string): boolean {
  const href = (ctaHref ?? "").trim();
  if (href === "") return true; // no CTA
  // Must be an internal path: starts with exactly one "/" ("//host" is protocol-relative).
  return href.startsWith("/") && !href.startsWith("//");
}

type BannerLeanDoc = {
  _id: unknown;
  title: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  scope: BannerScope;
  targetId?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
  priority?: number;
};

export function bannerDocToLike(d: BannerLeanDoc): BannerLike {
  return {
    id: String(d._id),
    title: d.title,
    body: d.body ?? "",
    imageUrl: d.imageUrl ?? "",
    ctaLabel: d.ctaLabel ?? "",
    ctaHref: d.ctaHref ?? "",
    scope: d.scope,
    targetId: d.targetId ?? "",
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    isActive: d.isActive,
    priority: d.priority ?? 0,
  };
}

export async function getActiveBannersForUser(userId: string): Promise<CustomerBanner[]> {
  if (!isValidObjectId(userId)) return [];
  await connectDB();

  const memory = await CustomerMemoryModel.findOne({ userId }).select("businessType").lean().exec();
  const businessType = memory?.businessType ?? null;

  const scopeOr: Array<Record<string, unknown>> = [
    { scope: "global" },
    { scope: "customer", targetId: userId },
  ];
  if (businessType) scopeOr.push({ scope: "businessType", targetId: businessType });

  const docs = (await BannerModel.find({ isActive: true, $or: scopeOr })
    .limit(50)
    .lean()
    .exec()) as unknown as BannerLeanDoc[];

  return selectActiveBanners(docs.map(bannerDocToLike), { userId, businessType });
}
