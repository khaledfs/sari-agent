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
