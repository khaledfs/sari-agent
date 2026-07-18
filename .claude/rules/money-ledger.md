# Money & ledger rules

Migrated from `docs/WORKING_INSTRUCTIONS.md` §3.8, §3.3.

## Integer minor units (agorot)
- Ledger money is stored as **integers in minor units (agorot)** — `debitMinor`/`creditMinor`. **No floating-point arithmetic anywhere in the ledger feature**; conversion from ₪ happens once at the API boundary via `toMinorUnits()`, display via `formatMinorUnits()` (integer math).

## Computed balance, immutable entries
- Balance = Σdebit − Σcredit over POSTED entries, **computed** server-side in deterministic chronological order — never store a denormalized balance.
- **Posted entries are immutable**: corrections are compensating reversal entries, keyed by a unique `idempotencyKey` (e.g. `order_charge:<orderId>`), never edits or deletes.
- Financial writes tied to another write (order creation) go **inside the same transaction**; realtime publish happens after commit.

## Pricing snapshot
- Orders store **line-item snapshots** at order time (name, computed price, quantity, `priceBreakdown` audit). A later product/price change must never alter a historical order. Unit price is never recomputed on adjustment — only quantities change.

## Stock commitment (idempotent)
- Stock is decremented **exactly once per order**, guarded by the `stockCommittedAt` stamp in `src/services/order.service.ts` (conditional claim, concurrent callers serialize). Card orders commit on the confirmed `paid` webhook; agent orders on dispatch; whichever fires second is a no-op. `returnOrderStock` (via `stockReturnedAt`) returns units once on cancel. Keep every payment/stock/ledger hook idempotent so replays and retries converge.
