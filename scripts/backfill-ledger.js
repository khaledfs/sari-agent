/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Backfill: ledger order_charge entries for orders created BEFORE the ledger
 * existed (Work Order Issue 8).
 *
 * For every order with no `order_charge:<orderId>` entry:
 *   - insert an order_charge (debit = order total in agorot) stamped with the
 *     ORDER's original createdAt so the running balance stays chronological;
 *   - if the order is cancelled, also insert the compensating
 *     `order_reversal:<orderId>` credit.
 *
 * Idempotent by construction: entries are keyed by unique idempotencyKey, so
 * re-running skips everything already posted. NEVER deletes or mutates.
 *
 * Usage:
 *   node scripts/backfill-ledger.js           # DRY RUN (default) — report only, NO writes
 *   node scripts/backfill-ledger.js --apply   # perform the real write
 *   node scripts/backfill-ledger.js --dry     # explicit no-op alias for the default
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { resolveMode, printModeBanner } = require("./_script-mode");

const args = process.argv.slice(2);
const { apply: APPLY, dry: DRY } = resolveMode(args);

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function toMinor(total) {
  return Math.round(Number(Number(total).toFixed(2)) * 100);
}

async function main() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI (set it in .env.local).");
    process.exit(1);
  }

  await mongoose.connect(uri, { bufferCommands: false });
  printModeBanner("backfill-ledger.js", APPLY, uri, mongoose.connection);
  const orders = mongoose.connection.collection("orders");
  const entries = mongoose.connection.collection("ledgerentries");

  const existingKeys = new Set(
    (await entries.find({ idempotencyKey: /^order_(charge|reversal):/ }).project({ idempotencyKey: 1 }).toArray()).map(
      (e) => e.idempotencyKey
    )
  );

  const allOrders = await orders
    .find({})
    .project({ userId: 1, total: 1, status: 1, createdAt: 1 })
    .toArray();

  const chargesToPost = [];
  const reversalsToPost = [];
  for (const order of allOrders) {
    const id = String(order._id);
    const amountMinor = toMinor(order.total);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) continue;
    const createdAt = order.createdAt instanceof Date ? order.createdAt : new Date();
    if (!existingKeys.has(`order_charge:${id}`)) {
      chargesToPost.push({
        userId: order.userId,
        type: "order_charge",
        orderId: order._id,
        description: `Order charge #${id.slice(-8).toUpperCase()} (backfill)`,
        debitMinor: amountMinor,
        creditMinor: 0,
        currency: "ILS",
        status: "posted",
        idempotencyKey: `order_charge:${id}`,
        createdAt,
      });
    }
    const isCancelled = String(order.status ?? "").toLowerCase() === "cancelled";
    if (isCancelled && !existingKeys.has(`order_reversal:${id}`)) {
      reversalsToPost.push({
        userId: order.userId,
        type: "refund",
        orderId: order._id,
        description: `Order cancelled — reversal #${id.slice(-8).toUpperCase()} (backfill)`,
        debitMinor: 0,
        creditMinor: amountMinor,
        currency: "ILS",
        status: "posted",
        idempotencyKey: `order_reversal:${id}`,
        createdAt,
      });
    }
  }

  console.log(`orders total:                    ${allOrders.length}`);
  console.log(`order_charge entries to post:    ${chargesToPost.length}`);
  console.log(`order_reversal entries to post:  ${reversalsToPost.length} (cancelled orders)`);
  console.log(`already posted (skipped):        ${existingKeys.size}`);

  if (DRY) {
    console.log("\n--dry run: no writes performed.");
    await mongoose.disconnect();
    return;
  }

  let inserted = 0;
  for (const doc of [...chargesToPost, ...reversalsToPost]) {
    try {
      await entries.insertOne(doc);
      inserted += 1;
    } catch (e) {
      if (e && e.code === 11000) continue; // raced/already posted — idempotent skip
      throw e;
    }
  }
  console.log(`\ninserted: ${inserted}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
