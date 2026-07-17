/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Migration: backfill user.accountStatus (Work Order Issue 3).
 *
 * Mapping (additive, idempotent):
 *   - users that already have accountStatus            → untouched
 *   - legacy soft-disabled users (isActive === false)  → accountStatus "restricted"
 *                                                         (+ restrictedAt = now,
 *                                                          restrictedReason marker)
 *   - everyone else                                    → accountStatus "active"
 *
 * The app maps unmigrated documents identically at read time
 * (resolveAccountStatus in account-status.service.ts), so running this is a
 * consistency backfill, not a behavior change.
 *
 * Follows the same pattern and safety rules as scripts/sync-products.js:
 *   - standalone Node script, reads .env.local, connects to Mongo directly
 *   - NEVER deletes anything, only $set on users missing accountStatus
 *   - safe to re-run (already-migrated users are excluded by the filter)
 *
 * Usage:
 *   node scripts/migrate-account-status.js           # DRY RUN (default) — report only, NO writes
 *   node scripts/migrate-account-status.js --apply   # perform the real write
 *   node scripts/migrate-account-status.js --dry     # explicit no-op alias for the default
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

async function main() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI (set it in .env.local).");
    process.exit(1);
  }

  await mongoose.connect(uri, { bufferCommands: false });
  printModeBanner("migrate-account-status.js", APPLY, uri, mongoose.connection);
  const users = mongoose.connection.collection("users");

  const unmigrated = { accountStatus: { $exists: false } };
  const [total, missing, legacyDisabled] = await Promise.all([
    users.countDocuments({}),
    users.countDocuments(unmigrated),
    users.countDocuments({ ...unmigrated, isActive: false }),
  ]);

  console.log(`users total:                     ${total}`);
  console.log(`missing accountStatus:           ${missing}`);
  console.log(`  → would become "restricted":   ${legacyDisabled} (legacy isActive=false)`);
  console.log(`  → would become "active":       ${missing - legacyDisabled}`);

  if (DRY) {
    console.log("\n--dry run: no writes performed.");
    await mongoose.disconnect();
    return;
  }

  const restrictedRes = await users.updateMany(
    { ...unmigrated, isActive: false },
    {
      $set: {
        accountStatus: "restricted",
        restrictedAt: new Date(),
        restrictedReason: "Migrated from legacy account disable (isActive=false).",
      },
    }
  );
  const activeRes = await users.updateMany(
    { accountStatus: { $exists: false } },
    { $set: { accountStatus: "active" } }
  );

  console.log(`\nset "restricted": ${restrictedRes.modifiedCount}`);
  console.log(`set "active":     ${activeRes.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
