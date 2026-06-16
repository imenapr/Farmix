const INTERNAL_AUTH_EMAIL_DOMAIN = "phone.farmix.app";

export function isInternalAuthEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  return value.endsWith(`@${INTERNAL_AUTH_EMAIL_DOMAIN}`);
}

/** Supabase Auth requires an email — derive a stable internal one from phone when omitted. */
export function authEmailFromPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) throw new Error("Valid phone required for signup without email.");
  return `p${digits}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

export function formatAuthIdentifier({ email, phone } = {}) {
  if (email && !isInternalAuthEmail(email)) return email;
  if (phone) return phone;
  return email ?? "";
}
