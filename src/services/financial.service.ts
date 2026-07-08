import { isValidObjectId } from "mongoose";

export type InvoiceStatus = "paid" | "unpaid" | "overdue";

export type MockInvoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};

function iso(d: Date) {
  return d.toISOString();
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Mock invoices for the authenticated user. Replace with DB/API when company billing exists.
 */
export function getMockInvoicesByUser(userId: string): MockInvoice[] {
  if (!isValidObjectId(userId)) {
    return [];
  }

  const seed = userId.slice(-6);
  const offset = parseInt(seed, 16) % 200;

  const now = new Date();
  const base = addDays(now, -90);

  const rows: MockInvoice[] = [
    {
      id: `inv-${userId}-1`,
      invoiceNumber: `INV-${seed.slice(0, 4).toUpperCase()}-001`,
      date: iso(addDays(base, 5)),
      dueDate: iso(addDays(base, 35)),
      amount: Math.round((2400 + offset) * 100) / 100,
      status: "paid",
    },
    {
      id: `inv-${userId}-2`,
      invoiceNumber: `INV-${seed.slice(0, 4).toUpperCase()}-002`,
      date: iso(addDays(base, 25)),
      dueDate: iso(addDays(base, 55)),
      amount: Math.round((1180 + offset / 2) * 100) / 100,
      status: "unpaid",
    },
    {
      id: `inv-${userId}-3`,
      invoiceNumber: `INV-${seed.slice(0, 4).toUpperCase()}-003`,
      date: iso(addDays(base, 40)),
      dueDate: iso(addDays(now, -3)),
      amount: Math.round((890 + offset) * 100) / 100,
      status: "overdue",
    },
    {
      id: `inv-${userId}-4`,
      invoiceNumber: `INV-${seed.slice(0, 4).toUpperCase()}-004`,
      date: iso(addDays(base, 55)),
      dueDate: iso(addDays(now, 12)),
      amount: Math.round((3320 - offset) * 100) / 100,
      status: "unpaid",
    },
    {
      id: `inv-${userId}-5`,
      invoiceNumber: `INV-${seed.slice(0, 4).toUpperCase()}-005`,
      date: iso(addDays(base, 70)),
      dueDate: iso(addDays(now, 28)),
      amount: Math.round((450 + offset / 3) * 100) / 100,
      status: "paid",
    },
    {
      id: `inv-${userId}-6`,
      invoiceNumber: `INV-${seed.slice(0, 4).toUpperCase()}-006`,
      date: iso(addDays(base, 82)),
      dueDate: iso(addDays(now, 5)),
      amount: Math.round((2100 + offset / 4) * 100) / 100,
      status: "unpaid",
    },
  ];

  return rows;
}

export type CheckStatus = "cleared" | "pending" | "returned";

export type MockCheck = {
  id: string;
  checkNumber: string;
  bankName: string;
  amount: number;
  date: string;
  status: CheckStatus;
};

/**
 * Mock checks for the authenticated user. Replace with DB/API when treasury data exists.
 */
export function getMockChecksByUser(userId: string): MockCheck[] {
  if (!isValidObjectId(userId)) {
    return [];
  }

  const n = parseInt(userId.slice(-4), 16) || 0;
  const offset = n % 150;

  const now = new Date();
  const base = new Date(now);
  base.setDate(base.getDate() - 60);

  const num = (i: number) => String(1000 + ((n + i * 7919) % 9000));

  const rows: MockCheck[] = [
    {
      id: `chk-${userId}-1`,
      checkNumber: num(1),
      bankName: "Hapoalim",
      amount: Math.round((3200 + offset) * 100) / 100,
      date: iso(addDays(base, 8)),
      status: "cleared",
    },
    {
      id: `chk-${userId}-2`,
      checkNumber: num(2),
      bankName: "Leumi",
      amount: Math.round((1850 + offset / 2) * 100) / 100,
      date: iso(addDays(base, 22)),
      status: "pending",
    },
    {
      id: `chk-${userId}-3`,
      checkNumber: num(3),
      bankName: "Discount",
      amount: Math.round((940 + offset) * 100) / 100,
      date: iso(addDays(base, 35)),
      status: "cleared",
    },
    {
      id: `chk-${userId}-4`,
      checkNumber: num(4),
      bankName: "Mizrahi-Tefahot",
      amount: Math.round((2750 - offset) * 100) / 100,
      date: iso(addDays(now, -6)),
      status: "returned",
    },
  ];

  return rows;
}
