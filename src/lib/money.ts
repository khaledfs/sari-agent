/**
 * Display formatting for ledger money (Work Order Issue 8).
 *
 * Amounts live as INTEGERS in agorot; this renders them without any
 * floating-point arithmetic — integer division + remainder only, grouping via
 * toLocaleString on the integer part.
 */
export function formatMinorUnits(locale: string, minor: number): string {
  if (!Number.isFinite(minor)) return "—";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  let grouped: string;
  try {
    grouped = whole.toLocaleString(locale);
  } catch {
    grouped = String(whole);
  }
  return `${sign}₪${grouped}.${String(fraction).padStart(2, "0")}`;
}
