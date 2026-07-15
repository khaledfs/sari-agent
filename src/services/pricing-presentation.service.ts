import type mongoose from "mongoose";

import { computePricesForProducts, type PriceBreakdown } from "@/services/pricing.service";

/**
 * Presentation helper: rewrites lean product documents so `price` is the
 * customer's computed price, keeping the admin/base price in `basePrice` and
 * the audit trail in `priceBreakdown`. tierPrices are stripped from customer
 * payloads (internal pricing data).
 */
export async function applyCustomerPricesToProducts<
  T extends { _id: unknown; price: number; tierPrices?: unknown },
>(
  products: T[],
  userId: string | null
): Promise<Array<Omit<T, "tierPrices"> & { basePrice: number; priceBreakdown?: PriceBreakdown }>> {
  const breakdowns = await computePricesForProducts(
    products as unknown as Array<{
      _id: mongoose.Types.ObjectId;
      price: number;
      tierPrices?: Map<string, number> | Record<string, number> | null;
    }>,
    userId
  );

  return products.map((p) => {
    const { tierPrices: _tierPrices, ...rest } = p;
    void _tierPrices;
    const breakdown = breakdowns.get(String(p._id));
    return {
      ...rest,
      basePrice: p.price,
      price: breakdown?.final ?? p.price,
      ...(breakdown ? { priceBreakdown: breakdown } : {}),
    };
  });
}
