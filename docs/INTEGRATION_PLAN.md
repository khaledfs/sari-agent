# Integration plan

Short checklist for mapping this app to real business systems. **Fill in each section** with your actual sources, owners, and constraints. Use **Assumptions** where facts are still unknown; use **Suggested integration approach** for a first-pass direction before detailed design.

---

## 1. Product data source

- Where are products stored today?
- How are prices managed (who updates them, which system is authoritative)?
- Does pricing vary per customer (contracts, tiers, regions)? If yes, how is that represented?

---

## 2. Orders flow

- How are orders received today (channels, systems)?
- Does an existing system already handle order intake, fulfillment, or ERP sync?
- What should happen in this app vs in that system after a customer places an order?

---

## 3. Financial data

- How is customer debt / balance calculated today?
- Where are invoices stored (system, format, identifiers)?
- Where are payments tracked (ledger, bank files, accounting package)?

---

## 4. System access

- Is there an API (REST, SOAP, GraphQL, webhooks)? Document base URL, auth method, and rate limits if known.
- Is direct database access available (read-only vs read-write, which schemas)?
- Are exports available (Excel, CSV, scheduled dumps)? Who generates them and how often?

---

## 5. Data frequency

- Which data must be **real-time** (or near real-time) for the customer-facing app?
- Which data is acceptable as **batch** (nightly, hourly, on-demand import)?
- Any SLAs or cut-off times (e.g. end-of-day settlement)?

---

## Next steps (optional)

_Use this space for decisions, owners, and milestones once the sections above are filled in._
