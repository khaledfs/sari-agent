/**
 * Optional customer business segmentation for analytics / future ML cohorts.
 * Stored on CustomerAccount (business layer), not on User (auth).
 *
 * Future extensions (not in schema yet): priceSensitivityBand, orderFrequencyProfile,
 * preferredPackSizes — document in DEV_NOTES / provision when product + payment signals exist.
 */

export const BUSINESS_TYPES = [
  "bakery",
  "confectionery",
  "ice_cream_shop",
  "eastern_sweets",
  "western_sweets_pastry",
  "boutique_bakery",
  "neighborhood_bakery",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const SIZE_BANDS = ["small", "medium", "large"] as const;

export type SizeBand = (typeof SIZE_BANDS)[number];

/** Free-text niche within businessType (e.g. " viennoiserie ", "gelato"). */
export type Specialization = string;
