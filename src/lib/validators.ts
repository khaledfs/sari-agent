const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isStrongPassword(password: string) {
  return PASSWORD_REGEX.test(password);
}

export function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email);
}

export function normalizePhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/\s+/g, "");
}

export function normalizeIsraeliPhoneNumber(phoneNumber: string) {
  const s = normalizePhoneNumber(phoneNumber).trim();
  if (!s) return "";

  if (s.startsWith("+")) return s;
  if (s.startsWith("972")) return `+${s}`;
  if (s.startsWith("0")) return `+972${s.slice(1)}`;
  return `+972${s}`;
}
