export const BUSINESS_ONBOARDING_TYPES = [
  "bakery",
  "eastern_sweets",
  "western_sweets_pastry",
  "cafe",
  "ice_cream_shop",
] as const;

export type BusinessOnboardingType = (typeof BUSINESS_ONBOARDING_TYPES)[number];
