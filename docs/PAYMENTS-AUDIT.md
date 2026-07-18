# SARI — Money & Stock Pipeline Audit (PAYMENTS-AUDIT)

**Auditor role:** independent QA — verify, don't fix. Read-only intent; every write below is on the
seeded demo customer and one product, and is reversed (data-hygiene log at the end).
**Date executed:** 2026-07-18
**Commit under audit:** `473752f` (branch `main`, clean tree at start)
**Server under test:** running dev server at `http://localhost:3000` (Next.js 16), `PAYMENTS_ENABLED=true`
(mock card adapter active).
**DB:** Atlas `sari` (shared). Only the seeded demo customer `+972-52-3841176` (userId
`6a50da36d8d896b7721ed71a`) and one product (`6a5a9e2775c6c6dca7a77f5c`, "משטח קמח שטיבל", ₪4,000,
stock 100) were touched. No seed/sync/migrate/backfill scripts run. No production access.

Evidence standard: every PASS/FAIL carries the probe command + observed numbers (agorot = integer minor
units, ₪1 = 100 agorot). Anything not executed is marked **NOT TESTED**.

---

# Executive Summary

**Is the money pipeline sound? NO — one HIGH-severity money defect, otherwise sound.**

The core mechanics are correct and provable: stock commits exactly once (idempotent across double
dispatch and webhook replay), never goes negative (floors at zero, oversell flags the order), the card
webhook is signature-gated and idempotent, and the customer ledger's Σdebit−Σcredit equals the displayed
balance exactly (201 posted entries, zero duplicate idempotency keys).

**But there is a real mismatch, exactly where the owner suspected it — between collection and the
supplied-quantity adjustment.** A collection task's amount is snapshotted when the order is *confirmed*
and is **never updated** when the warehouse later supplies less. Because the intended workflow is
"shorten the order during packing → agent collects on delivery", the mainline shortage path collects the
**pre-shortage** amount. Proven live: a ₪16,000 agent order adjusted down to ₪4,000 still produced a
₪16,000 collection payment, leaving the customer's ledger **₪12,000 too low**.

| # | Severity | Finding |
|---|----------|---------|
| **F1** | **HIGH** | Collection amount is stale after a supply adjustment → over-collection / phantom ledger credit by the shortage delta (PROVEN live). |
| F2 | MEDIUM | List-vs-collect scope asymmetry after customer reassignment (code-evidenced). |
| F3 | MEDIUM | Fail-soft lifecycle hooks can silently drop a collection task or a cancel reversal. |
| F4 | LOW | Payment capture on a **restricted** account is reachable for a pre-existing intent (PROVEN). |
| F5 | LOW | Collections screen shows the stale amount + an untranslated raw order status. |
| F6 | LOW | 30-day window drift between the agents roster and the overview aggregations. |
| F7 | INFO | Overview `weeklyRevenue` silently caps at 5,000 orders. |
| F8 | INFO | Default `MOCK_WEBHOOK_SECRET` is a public constant; in use on this box. |

---

# Per-invariant results

### 1. Agent-payment order lifecycle — **PASS**
Stock untouched until dispatch; commits exactly once on dispatch; collection task created at *approval*,
not before; collect posts one ledger `payment` for the server-side amount, actor recorded.
Evidence (probe2 §C, probe1):
```
order created paymentMethod=agent, paymentStatus=collect_via_agent
stock after confirm = 100   (commit is at dispatch, not confirm)  ✓
dispatch: 100 -> 98 (qty 2)          ✓ commits once
task_at_confirm.amountMinor = 1600000 == round(order.total*100)   ✓ server amount
```

### 2. Card-payment order (mock adapter) — **PASS**
Order stays `pending` with a client token (no card data server-side) until the signed webhook; stock
decrements only on confirmed `paid`, exactly once; `order_charge` + `payment` net to zero.
Evidence (probe2 §B):
```
card order: paymentStatus=pending, hasToken=true, stock before pay=100
mock/complete paid -> paymentStatus=paid, stock 100 -> 97 (qty 3), balance_net_delta = 0  ✓
```

### 3. Stock-commit idempotency — **PASS**
`stockCommittedAt` guards the decrement; double dispatch and webhook replay are both no-ops.
Evidence (probe2 §B replay, §C double-dispatch):
```
double dispatch: after_first=98, after_double=98  -> decremented once   ✓
webhook replay:  stock_same=true, balance_same=true                     ✓
```

### 4. Ledger integrity (Σdebit − Σcredit == balance; no duplicate entries) — **PASS**
Evidence (probe2 §A, full paginated scan of the customer ledger):
```
entries total=201, posted=201, void=0
Σ(debitMinor - creditMinor) = 884250  ==  summary.currentBalanceMinor = 884250   ✓
duplicate idempotencyKeys = 0
```
Caveat: the balance is *internally consistent*, but F1 shows a way to make it consistently **wrong**.

### 5. Supplied-quantity adjustment on a PAID order — **PASS (card) / FAIL (agent) → F1**
- **Card-paid, then adjusted down 3→1:** compensating credit = exact delta; the resulting negative
  balance is a *genuine customer credit* for undelivered goods (they really paid the full amount by
  card). Correct. Evidence (probe2 §B): `newTotal=4000, credit_delta=-800000` (₪8,000 credit).
- **Agent order, adjusted down then collected:** the collection payment is the **stale** pre-adjustment
  amount → wrong. This is **F1** below.

### 6. Oversell path (last-unit race) — **PASS**
Commit floors at available stock, flags the order for supplied-qty adjustment, and stock never goes
negative. A two-order race on the last unit flags exactly one order.
Evidence (probe2 §D single order; probe3 two-order race):
```
oversell (stock 2, order 3): stock_floored=0, negative=false, adjusted=true, supplied=2/3     ✓
                             ledger nets to adjusted total (delta 800000 == adjustedTotal 800000) ✓
last-unit race (stock 1, two qty-1 orders):
   o1 supplied=1 (not flagged), o2 supplied=0 (adjusted=true), stock 0, ever_negative=false     ✓
```

### 7. Stock read/write consistency — **PASS (with one NOT TESTED)**
The customer sees the same `stock` field the admin does (`/api/products/[id]` → 100 == admin 100). The
per-line commit decrement is an atomic pipeline `stock = max(0, stock − qty)` via `findOneAndUpdate`
returning the pre-image (per code review, `order.service.ts:471-475`) — no read-modify-write, no
negative floor breach (proven in §6).
**NOT TESTED (live):** the admin inline stock edit (`updateAdminProduct`) is a plain `$set` and could
race a concurrent commit and overwrite a decrement; a deterministic concurrency probe wasn't run. Low
likelihood (admin edits are manual), noted for completeness.

### 8. Restricted-customer payment bypass — **MIXED → F4**
New order creation while restricted is correctly blocked (403 `ACCOUNT_RESTRICTED`). But a **pre-existing**
card intent can still be completed while the account is restricted.
Evidence (probe2 §E):
```
new order while restricted:                 status=403, code=ACCOUNT_RESTRICTED   ✓ (guard works)
pay pre-existing intent while restricted:   mock/complete -> 200, paymentStatus=paid   ⚠ reachable
```

---

# Findings

## F1 — HIGH — Collection amount is stale after a supply adjustment (over-collection / phantom credit)

**What.** A `CollectionTask.amountMinor` is written **once**, by `createCollectionTaskForOrder`
(`src/services/collection-tasks.service.ts:65`, `$setOnInsert`), from the order total at the moment the
order becomes `confirmed`. When the warehouse later supplies less via `adjustOrderSupply`
(`src/lib/admin-orders.ts`), the order total drops and a compensating ledger credit is posted, but the
task amount is **never updated** — grep confirms the only writer of `amountMinor` is the create path.
`markCollectionCollected` then posts a ledger `payment` of `task.amountMinor`
(`collection-tasks.service.ts:179`) — the stale, pre-adjustment amount.

**Why it's mainline, not an edge case.** Adjustment is allowed only pre-dispatch
(`pending|confirmed|packed`); the task is created at `confirmed`; a task can be collected at any time
after that. The intended real workflow is exactly: confirm → **shorten during packing** → dispatch →
**agent collects on delivery**. So the ordinary shortage path for an agent-paid order collects the
pre-shortage amount.

**Evidence (probe1, live, restored):**
```
order 4 × ₪4000 (agent) → order_charge debit           1,600,000 agorot
supply adjusted 4 → 1  → order_adjustment credit         1,200,000   (order total now ₪4,000)
collection task amountMinor AFTER adjust:                1,600,000   ← still the ₪16,000 original
mark collected          → ledger payment credit          1,600,000   ← should have been 400,000
resulting balance vs. correct:  PHANTOM_CREDIT = −1,200,000 agorot (−₪12,000)
order ledger entries: [order_charge 1,600,000 debit] [refund/adjustment 1,200,000 credit] [payment 1,600,000 credit]
```
Intended-correct math (agorot): charge 1,600,000 − adjustment 1,200,000 − payment **400,000** = 0.
Actual: charge 1,600,000 − adjustment 1,200,000 − payment **1,600,000** = −1,200,000.

**Business impact.** Two ways the money is wrong, both bad:
1. The collections screen tells the agent to collect the **pre-shortage** cash (₪16,000 for ₪4,000 of
   goods delivered) — the customer is over-charged at the door.
2. If the agent instead collects the correct cash, the ledger still records the pre-shortage payment →
   the customer's account shows a **phantom credit** equal to the shortage, wrongly reducing their next
   invoice. Either way, the cash collected and the ledger no longer agree with the goods supplied.

**Suggested fix (not implemented).** At collection time, source the payment amount from the **live order
total** rather than the task snapshot, or update `CollectionTask.amountMinor` inside `adjustOrderSupply`
(same transaction that posts the adjustment credit). The former is simpler and self-healing:
`markCollectionCollected` already loads the task by id — load the order and post
`toMinorUnits(order.total)`. Add a regression test: agent order → adjust down → collect → assert the
payment equals the adjusted total and the balance returns to baseline.

## F2 — MEDIUM — List/collect scope asymmetry after customer reassignment

**What.** `listOpenCollections` filters by the task's **snapshotted** `agentId`
(`collection-tasks.service.ts:100-103`), while `markCollectionCollected` authorizes against the customer's
**live** assignment (via `assertCanActOnCustomer`, lines 166-170). After an admin reassigns a customer
from agent A to agent B, an open task keeps its `agentId=A` snapshot: agent A still **sees** the task but
gets 404 on collect (live scope check), and agent B **can** collect it (by task id) but never sees it in
their list. Only the admin view is coherent.
**Evidence:** code as cited (this specific two-agent reassignment sequence was **NOT TESTED live** — the
seed customer is unassigned; the asymmetry is a direct read of the two divergent filters).
**Impact.** Collection tasks can become invisible-but-collectible after a handover; an agent chases a task
they can no longer action. Money isn't lost but collection can stall or land with the wrong actor.
**Suggested fix.** Make both paths agree — filter the list by live `scopedCustomerObjectIds` (customer
assignment) rather than the task's `agentId` snapshot, or refresh `agentId` on reassignment.

## F3 — MEDIUM — Fail-soft lifecycle hooks can silently drop a task or a reversal

**What.** In `updateAdminOrderStatus`, both the cancel **reversal** ledger post
(`admin-orders.ts:407-422`) and the task/stock lifecycle hooks (`:424-442`, including
`createCollectionTaskForOrder`) are wrapped in `try/catch` that only `console.error`s. If the task upsert
fails, an agent order is confirmed with **no collection task** — the money is never scheduled for
collection, and the hook only re-runs on another transition *into* `confirmed`. If the reversal post
fails, a cancelled order keeps its `order_charge` with no compensating credit.
**Evidence:** code as cited. Not reproduced live (would require inducing a DB failure).
**Impact.** Rare but silent: uncollected agent money, or a cancelled order that still shows a debt.
**Suggested fix.** Keep fail-soft for the status change itself, but surface a durable retry/alert (or a
reconciliation sweep) for a dropped task/reversal; the idempotency keys already make re-posting safe.

**Related (same mechanism, code-verified, not the fail-soft path): cancel-then-reconfirm never
re-collects.** `cancelCollectionTaskForOrder` sets the task `status: cancelled`
(`collection-tasks.service.ts:87-90`); if that agent order is later re-confirmed,
`createCollectionTaskForOrder` runs `updateOne({orderId}, {$setOnInsert:{…}}, {upsert:true})` — the doc
already exists, so `$setOnInsert` is a no-op and the task stays `cancelled`. A re-confirmed agent order
therefore **never gets a collectible task** and its money is never scheduled. Fix: on re-confirm, re-open
a cancelled task (or match the upsert on `{orderId, status: {$ne:'cancelled'}}`).

## F4 — LOW — Payment capture reachable on a restricted account

**What.** `requireOrderingEnabled` guards order creation and cart mutations but is **not** on the webhook /
`mock/complete` path. A customer restricted *after* creating a card intent can still complete the payment.
**Evidence (probe2 §E):** new order while restricted → 403 `ACCOUNT_RESTRICTED`; `mock/complete` on the
pre-existing intent → 200, `paymentStatus=paid`.
**Assessment.** Defensible by design — payment capture ≠ ordering, the order predates the restriction, and
a real provider webhook *must* be honored idempotently regardless of app state (you can't reject cash the
provider already captured). Flagged so it's a **conscious** decision, not an accident. If the intent of
"restricted" is to freeze all money movement, add a guard on the capture path (and decide what the
provider webhook does with a rejected capture).
**Suggested fix.** None required unless policy says restriction must block capture; if so, gate
`markOrderPaidByIntent` on account status and define the provider-webhook fallback.

## F5 — LOW — Collections screen shows the stale amount and an untranslated status

**What.** `admin/dashboard/collections/page.tsx:137-138` renders `r.amountMinor` (the stale F1 value) and
the raw order status string (`out_for_delivery`) verbatim instead of translating via
`adminDashboard.orders.status.*` the way the overview page does. Cosmetic in he/ar; but it also means the
UI actively displays the wrong collection amount from F1.
**Suggested fix.** Fixing F1 fixes the amount; translate the status label for locale correctness.

## F6 — LOW — 30-day window drift between surfaces

**What.** The agents roster's 30-day rollup uses a **rolling** `Date.now() − 30d`
(`src/lib/admin-agents.ts:53`), while the overview uses a **day-aligned** `startOfDay(now) − 29d`
(`src/services/admin-overview.service.ts:117-119`). The same agent's "last 30 days" revenue differs
between the two screens.
**Impact.** Directly relevant to the requested "agent performance in the admin overview" feature — reusing
the roster aggregation without normalizing the window will show mismatched numbers on the same page.
**Suggested fix.** Pick one window definition for both.

## F7 — INFO — Overview weeklyRevenue caps at 5,000 orders

`admin-overview.service.ts:166` limits the weekly aggregation to 5,000 documents with no "truncated"
signal in the payload; beyond that the 8-week sparkline silently undercounts and diverges from the
period-stat aggregates (which have no cap).

## F8 — INFO — Default mock webhook secret is a public constant

`MOCK_WEBHOOK_SECRET` defaults to the literal `'sari-dev-mock-webhook-secret'`
(`payments.service.ts:47`) and is **unset** on this box, so the webhook signing key is a known constant.
Blast radius is limited (the mock adapter refuses to run under `NODE_ENV=production`, and `mock/complete`
requires the customer's own session + own card order), but on any dev/staging host with
`PAYMENTS_ENABLED=true` and this default, a forged signed webhook to `/api/payments/webhook` would mark an
order paid. Set a real `MOCK_WEBHOOK_SECRET` off localhost, and a real provider secret before go-live
(already noted in DEPLOYMENT §2).

---

# "Money can be wrong when…"

Every scenario where stock, ledger, or collection can desync, from the code + probes:

1. **Agent-paid order gets a supply shortage, then is collected** (F1, PROVEN). Collection posts the
   pre-shortage amount → over-collection at the door, or a phantom ledger credit equal to the shortage.
   This is the ordinary shortage workflow, not an edge case.
2. **A customer is reassigned between agents while a collection task is open** (F2). The task becomes
   visible to the old agent but only collectible by the new one (by id), or vice-versa; collection can
   stall or be actioned by the wrong actor.
3. **The confirm-time task-creation hook throws, OR an order is cancelled and later re-confirmed** (F3).
   Either leaves an agent order with no collectible task — the money is never scheduled. (Re-entering
   `confirmed` does *not* rescue it: the cancelled task's doc already exists, so the `$setOnInsert` upsert
   is a no-op.)
4. **The cancel reversal post throws** (F3). A cancelled order keeps its `order_charge` with no
   compensating credit → the customer shows a debt for a cancelled order until cancel is re-run.
5. **An order is cancelled after its collection was already collected.** Cancel posts a full reversal for
   the (current) order total and `cancelCollectionTaskForOrder` only flips *open* tasks; a collected task
   stays collected, so the ledger nets to a credit of the whole total while the agent already holds the
   cash — correct only if the cash is manually handed back (nothing in code tracks that). (Code-evidenced;
   compounds with F1 when the order was also adjusted.)
6. **A card order is adjusted down after payment** (by design, verified correct). Produces a genuine
   customer credit for undelivered goods — *not* a bug, but operators must know the negative balance means
   "we owe the customer / reduces the next invoice", not "unpaid".
7. **More than 5,000 non-cancelled orders land in an 8-week window** (F7). The overview sparkline silently
   undercounts; revenue tiles (uncapped) will disagree with it.
8. **`ordersByStatus` vs revenue** (by design). The status breakdown counts cancelled orders while every
   revenue figure excludes them, and ledger `refund` reversals mean ledger totals never equal overview
   revenue — expected, but a source of "the numbers don't match" confusion.

---

# Data-hygiene log — every write and its reversal

All writes were on the seeded demo customer (`6a50da36…`) and product `6a5a9e27…`. Baseline captured and
re-asserted at the end of **each** probe.

| Probe | Writes performed | Reversal | Verified restored |
|-------|------------------|----------|-------------------|
| probe1 (F1) | agent order created + confirmed + supply-adjusted + collected + cancelled; ledger entries: charge, adjustment credit, payment, cancel reversal | order cancelled; offsetting ledger adjustment (`AUDIT PROBE restore (auto)`) posted to return balance to baseline | `RESTORED_OK=true`, balance 884250 == baseline; stock unchanged (100) |
| probe2 §B | product stock set 100; card order created→paid→adjusted→cancelled; ledger charge/payment/adjustment/reversal | order cancelled; ledger offset; stock reset to original 100 | balance 884250 == baseline; stock 100 |
| probe2 §C | stock 100; agent order created→confirmed→dispatched(×2)→cancelled | order cancelled (returns stock); ledger offset; stock reset | balance restored; stock 100 |
| probe2 §D | stock set 2; oversell agent order created→confirmed→dispatched→cancelled | order cancelled (returns 2 units); ledger offset; stock reset to 100 | balance restored; stock 100 |
| probe2 §E | card order created (active); customer set `restricted`; blocked order attempt; pre-existing intent paid; | customer set back to `active`; order cancelled; ledger offset | `accountStatus` back to active; balance restored |
| probe3 (race) | stock set 1; two agent orders created→confirmed→dispatched→cancelled | both orders cancelled (return units); ledger offset; stock reset to 100 | balance 884250 == baseline; stock 100 |

**Net effect on the shared DB:** balance and stock returned to baseline in every probe (final assertions
`restored:true`, `stock_ok:true`). Because the ledger is append-only and immutable by design, the
restoration is a *balancing* offset entry per probe (type `adjustment`/`credit`, description
`AUDIT PROBE restore (auto)`) — the running balance is correct, but the offset entries and the probe
orders/entries remain in history as an audit trail (they cannot be deleted; this mirrors how the existing
smoke suite restores). The probe orders are left in `cancelled` status. No other customer, no production
data, and no catalog data (beyond the one product's stock, restored) were touched. Temporary probe
scripts were kept in the scratch dir only and deleted after the run.

---

# Not tested (explicit gaps)

- Real payment-provider webhook (only the dev mock adapter exists; production refuses it).
- The F2 two-agent reassignment sequence live (seed customer is unassigned) — code-evidenced only.
- The F3 fail-soft failure modes (would require inducing a DB error mid-hook).
- The F7 admin-inline-edit vs concurrent-commit race (needs true concurrency).
- Multi-instance behavior (the in-process rate limiter and event bus are single-process by design).
