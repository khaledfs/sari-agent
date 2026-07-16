/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Backfill: demo field agents + random customer assignment (Work Order 2,
 * Task D).
 *
 * ⚠ POC CONVENIENCE for the existing demo data ONLY: real customer→agent
 * relationships must be set deliberately by the admin through the UI. The
 * random pass exists so the feature is demoable without hand-linking every
 * seeded customer.
 *
 * What it does:
 *   1. Upserts 3 demo agents (by phone, like scripts/seed-customers.js);
 *      password for all: Agent1234.
 *   2. Randomly assigns every CURRENTLY UNASSIGNED customer to one of them,
 *      spread roughly evenly.
 *
 * IDEMPOTENT MEANS STABLE: re-running never reshuffles existing assignments —
 * only customers with assignedAgentId null/missing are touched.
 * Never deletes anything.
 *
 * Usage:
 *   node scripts/seed-agents.js --dry   # report only, NO writes
 *   node scripts/seed-agents.js         # real write (requires approval)
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");

const AGENT_PASSWORD = "Agent1234";

const DEMO_AGENTS = [
  { businessName: "סוכן אמין קבלאוי", email: "amin.agent@seed.sari.local", phoneNumber: "+972-50-7100001", routeLabel: "קו צפון — עכו/נהריה" },
  { businessName: "סוכן יוסי מזרחי", email: "yossi.agent@seed.sari.local", phoneNumber: "+972-50-7100002", routeLabel: "קו מרכז — פ״ת/ראשל״צ" },
  { businessName: "וكيل سامر خوري", email: "samer.agent@seed.sari.local", phoneNumber: "+972-50-7100003", routeLabel: "خط الجنوب — رهط/بئر السبع" },
];

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

/** Deterministic-ish spread: cycle through agents in shuffled order. */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI (set it in .env.local).");
    process.exit(1);
  }

  await mongoose.connect(uri, { bufferCommands: false });
  const users = mongoose.connection.collection("users");

  // 1. Demo agents (upsert by phone — never duplicated, never overwritten).
  const agentIds = [];
  for (const agent of DEMO_AGENTS) {
    const existing = await users.findOne({ phoneNumber: agent.phoneNumber });
    if (existing) {
      agentIds.push(existing._id);
      console.log(`agent exists:   ${agent.businessName} (${agent.phoneNumber})`);
      continue;
    }
    if (DRY) {
      console.log(`would create:   ${agent.businessName} (${agent.phoneNumber}) — ${agent.routeLabel}`);
      continue;
    }
    const inserted = await users.insertOne({
      businessName: agent.businessName,
      email: agent.email,
      phoneNumber: agent.phoneNumber,
      password: await bcrypt.hash(AGENT_PASSWORD, 10),
      role: "agent",
      isVerified: true,
      isActive: true,
      accountStatus: "active",
      routeLabel: agent.routeLabel,
      adminNotes: "",
      createdAt: new Date(),
    });
    agentIds.push(inserted.insertedId);
    console.log(`created agent:  ${agent.businessName} (${agent.phoneNumber})`);
  }

  // 2. Assign ONLY currently-unassigned customers (stability on re-run).
  const unassigned = await users
    .find({ role: "customer", $or: [{ assignedAgentId: null }, { assignedAgentId: { $exists: false } }] })
    .project({ _id: 1, businessName: 1 })
    .toArray();
  const assignedAlready = await users.countDocuments({ role: "customer", assignedAgentId: { $ne: null } });

  console.log(`\ncustomers already assigned (untouched): ${assignedAlready}`);
  console.log(`customers to assign now:                ${unassigned.length}`);

  if (DRY) {
    const per = Math.ceil(unassigned.length / DEMO_AGENTS.length);
    console.log(`would spread ~${per} customers per agent across ${DEMO_AGENTS.length} agents`);
    console.log("\n--dry run: no writes performed.");
    await mongoose.disconnect();
    return;
  }

  const shuffled = shuffle(unassigned);
  const distribution = new Map();
  for (let i = 0; i < shuffled.length; i += 1) {
    const agentId = agentIds[i % agentIds.length];
    await users.updateOne(
      // Guard again at write time: only if still unassigned.
      { _id: shuffled[i]._id, $or: [{ assignedAgentId: null }, { assignedAgentId: { $exists: false } }] },
      { $set: { assignedAgentId: agentId } }
    );
    distribution.set(String(agentId), (distribution.get(String(agentId)) ?? 0) + 1);
  }

  console.log("\nassignment distribution:");
  for (const [agentId, count] of distribution) {
    console.log(`  agent ${agentId}: +${count} customers`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed-agents failed:", err);
  process.exit(1);
});
