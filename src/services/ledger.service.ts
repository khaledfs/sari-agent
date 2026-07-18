import mongoose, { isValidObjectId } from "mongoose";
import { randomUUID } from "node:crypto";

import { connectDB } from "@/lib/db";
import { LedgerEntryModel, LEDGER_ENTRY_TYPES, type LedgerEntryType } from "@/models/ledger-entry.model";
import { publishRealtimeEvent } from "@/services/event-bus.service";

/**
 * Ledger service (Work Order Issue 8). All amounts are integers in agorot —
 * NO floating-point arithmetic anywhere in this module. The running balance
 * is COMPUTED from posted entries in deterministic chronological order
 * (createdAt asc, _id tiebreak); no stored/denormalized balance.
 */

export const LEDGER_CURRENCY = "ILS";

/** Entry types an admin may record manually. */
export const ADMIN_POSTABLE_TYPES = ["payment", "credit", "adjustment"] as const;

export type LedgerCheque = { number: string | null; date: string | null; bank: string | null };

export type LedgerEntryView = {
  id: string;
  type: LedgerEntryType;
  orderId: string | null;
  description: string;
  debitMinor: number;
  creditMinor: number;
  currency: string;
  status: "posted" | "void";
  createdAt: string;
  createdByRole: string | null;
  /** Payment method + cheque metadata (present on cheque/cash payments). */
  paymentMethod: "cash" | "cheque" | null;
  cheque: LedgerCheque | null;
  /** Balance in agorot AFTER this entry (chronological), posted entries only. */
  balanceAfterMinor: number;
};

export type LedgerPage = {
  entries: LedgerEntryView[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  summary: {
    currentBalanceMinor: number;
    currency: string;
    lastEntryAt: string | null;
  };
};

type EntryLean = {
  _id: mongoose.Types.ObjectId;
  type: LedgerEntryType;
  orderId?: mongoose.Types.ObjectId;
  description: string;
  debitMinor: number;
  creditMinor: number;
  currency: string;
  status: "posted" | "void";
  createdAt: Date;
  createdByRole?: string;
  paymentMethod?: "cash" | "cheque" | null;
  chequeNumber?: string;
  chequeDate?: Date;
  chequeBank?: string;
};

/** Major → minor units without float drift (string-based, exported for tests). */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number.");
  }
  // Fixed-point via string so 12.34 → 1234 exactly (never 1233.9999…).
  const minor = Math.round(Number(amount.toFixed(2)) * 100);
  if (!Number.isInteger(minor)) {
    throw new Error("Amount has more than 2 decimal places.");
  }
  return minor;
}

/** Sign convention (pure, unit-tested): which side an entry type posts on. */
export function entrySides(type: LedgerEntryType, amountMinor: number): { debitMinor: number; creditMinor: number } {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Amount must be a positive integer of minor units.");
  }
  switch (type) {
    case "order_charge":
    case "adjustment":
    case "opening_balance":
      return { debitMinor: amountMinor, creditMinor: 0 };
    case "payment":
    case "credit":
    case "refund":
      return { debitMinor: 0, creditMinor: amountMinor };
  }
}

/**
 * Deterministic chronological running balance over POSTED entries (pure,
 * unit-tested): sorts by createdAt then _id, balance += debit − credit.
 * Integer arithmetic only — no drift by construction.
 */
export function computeRunningBalances(entries: EntryLean[]): Array<EntryLean & { balanceAfterMinor: number }> {
  const sorted = [...entries].sort((a, b) => {
    const at = a.createdAt.getTime();
    const bt = b.createdAt.getTime();
    if (at !== bt) return at - bt;
    return String(a._id) < String(b._id) ? -1 : 1;
  });
  let balance = 0;
  return sorted.map((entry) => {
    if (entry.status === "posted") {
      balance += entry.debitMinor - entry.creditMinor;
    }
    return { ...entry, balanceAfterMinor: balance };
  });
}

function toView(entry: EntryLean & { balanceAfterMinor: number }): LedgerEntryView {
  const hasCheque = Boolean(entry.chequeNumber || entry.chequeDate || entry.chequeBank);
  return {
    id: String(entry._id),
    type: entry.type,
    orderId: entry.orderId ? String(entry.orderId) : null,
    description: entry.description,
    debitMinor: entry.debitMinor,
    creditMinor: entry.creditMinor,
    currency: entry.currency,
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
    createdByRole: entry.createdByRole ?? null,
    paymentMethod: entry.paymentMethod ?? null,
    cheque: hasCheque
      ? {
          number: entry.chequeNumber ?? null,
          date: entry.chequeDate ? entry.chequeDate.toISOString() : null,
          bank: entry.chequeBank ?? null,
        }
      : null,
    balanceAfterMinor: entry.balanceAfterMinor,
  };
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

/**
 * A customer's ledger page (newest first for display) with per-entry running
 * balances computed over the FULL chronological history, so pagination can
 * never distort a balance. B2B entry volume is small (≤ a few hundred per
 * customer); the full-scan approach is deliberate and documented.
 */
export async function getLedgerForUser(
  userId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<LedgerPage> {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  await connectDB();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));

  const raw = (await LedgerEntryModel.find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .exec()) as unknown as EntryLean[];

  const withBalances = computeRunningBalances(raw);
  const currentBalanceMinor = withBalances.length
    ? withBalances[withBalances.length - 1].balanceAfterMinor
    : 0;

  const newestFirst = [...withBalances].reverse();
  const start = (page - 1) * pageSize;
  const slice = newestFirst.slice(start, start + pageSize);

  return {
    entries: slice.map(toView),
    page,
    pageSize,
    total: withBalances.length,
    hasMore: start + pageSize < withBalances.length,
    summary: {
      currentBalanceMinor,
      currency: LEDGER_CURRENCY,
      lastEntryAt: withBalances.length ? withBalances[withBalances.length - 1].createdAt.toISOString() : null,
    },
  };
}

/** Lightweight summary (single aggregation) for the account/profile endpoints. */
export async function getLedgerSummary(userId: string): Promise<{
  currentBalanceMinor: number;
  currency: string;
  lastEntryAt: string | null;
}> {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  await connectDB();
  const rows = await LedgerEntryModel.aggregate<{
    _id: null;
    balance: number;
    lastEntryAt: Date;
  }>([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: "posted" } },
    {
      $group: {
        _id: null,
        balance: { $sum: { $subtract: ["$debitMinor", "$creditMinor"] } },
        lastEntryAt: { $max: "$createdAt" },
      },
    },
  ]).exec();
  const row = rows[0];
  return {
    currentBalanceMinor: row?.balance ?? 0,
    currency: LEDGER_CURRENCY,
    lastEntryAt: row?.lastEntryAt ? row.lastEntryAt.toISOString() : null,
  };
}

export type PostLedgerEntryInput = {
  userId: string;
  type: LedgerEntryType;
  amountMinor: number;
  description: string;
  orderId?: string;
  idempotencyKey?: string;
  actor?: { userId: string; role: string };
  /** Payment method + cheque metadata (additive; set on collection payments). */
  paymentMethod?: "cash" | "cheque";
  cheque?: { number?: string; date?: Date; bank?: string };
  /** "ignore" = replay-safe no-op on duplicate key (order paths); "error" = reject. */
  onDuplicate?: "ignore" | "error";
  session?: mongoose.ClientSession;
  /** Skip the realtime publish (used inside transactions — publish after commit). */
  deferPublish?: boolean;
};

/**
 * Sum of POSTED `payment` credits recorded against one order (agorot). This is
 * the single source for a collection's settled amount — a task's outstanding is
 * `taskAmount − sumOrderPayments(orderId)`, so ledger and collections agree by
 * construction and can never double-count.
 */
export async function sumOrderPayments(orderId: string): Promise<number> {
  if (!isValidObjectId(orderId)) return 0;
  await connectDB();
  const rows = await LedgerEntryModel.aggregate<{ _id: null; paid: number }>([
    {
      $match: {
        orderId: new mongoose.Types.ObjectId(orderId),
        type: "payment",
        status: "posted",
      },
    },
    { $group: { _id: null, paid: { $sum: "$creditMinor" } } },
  ]).exec();
  return rows[0]?.paid ?? 0;
}

/** Count of posted payment entries against one order (drives the idempotency seq). */
export async function countOrderPayments(orderId: string): Promise<number> {
  if (!isValidObjectId(orderId)) return 0;
  await connectDB();
  return LedgerEntryModel.countDocuments({
    orderId: new mongoose.Types.ObjectId(orderId),
    type: "payment",
    status: "posted",
  }).exec();
}

/** Payments-per-order map for a set of orders (one aggregation, no N+1). */
export async function sumPaymentsByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const valid = orderIds.filter((id) => isValidObjectId(id));
  if (valid.length === 0) return new Map();
  await connectDB();
  const rows = await LedgerEntryModel.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
    {
      $match: {
        orderId: { $in: valid.map((id) => new mongoose.Types.ObjectId(id)) },
        type: "payment",
        status: "posted",
      },
    },
    { $group: { _id: "$orderId", paid: { $sum: "$creditMinor" } } },
  ]).exec();
  return new Map(rows.map((r) => [String(r._id), r.paid]));
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

/**
 * Posts one immutable ledger entry. Duplicate idempotencyKey either no-ops
 * (order replay safety) or rejects (admin manual posts). Publishes
 * ledger.entry_created AFTER a successful write unless deferred by a caller
 * that is inside a transaction.
 */
export async function postLedgerEntry(input: PostLedgerEntryInput): Promise<{ entryId: string; created: boolean }> {
  if (!isValidObjectId(input.userId)) {
    throw new Error("Invalid user id.");
  }
  if (!(LEDGER_ENTRY_TYPES as readonly string[]).includes(input.type)) {
    throw new Error("Invalid ledger entry type.");
  }
  const description = input.description.trim();
  if (!description) {
    throw new Error("Description is required.");
  }
  const sides = entrySides(input.type, input.amountMinor);
  const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();

  await connectDB();
  const doc = {
    userId: new mongoose.Types.ObjectId(input.userId),
    type: input.type,
    ...(input.orderId && isValidObjectId(input.orderId)
      ? { orderId: new mongoose.Types.ObjectId(input.orderId) }
      : {}),
    description,
    ...sides,
    currency: LEDGER_CURRENCY,
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.cheque?.number ? { chequeNumber: input.cheque.number } : {}),
    ...(input.cheque?.date ? { chequeDate: input.cheque.date } : {}),
    ...(input.cheque?.bank ? { chequeBank: input.cheque.bank } : {}),
    ...(input.actor ? { createdByUserId: input.actor.userId, createdByRole: input.actor.role } : {}),
    status: "posted" as const,
    idempotencyKey,
  };

  try {
    const [created] = await LedgerEntryModel.create([doc], input.session ? { session: input.session } : {});
    if (!input.deferPublish) {
      publishRealtimeEvent({
        type: "ledger.entry_created",
        userId: input.userId,
        entryId: String(created._id),
      });
    }
    return { entryId: String(created._id), created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      if (input.onDuplicate === "ignore") {
        const existing = await LedgerEntryModel.findOne({ idempotencyKey }).select("_id").lean().exec();
        return { entryId: existing ? String(existing._id) : "", created: false };
      }
      throw new Error("Duplicate ledger entry (idempotency key already used).");
    }
    throw error;
  }
}
