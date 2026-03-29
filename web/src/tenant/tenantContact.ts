function toDigits(value: string | null): string {
  return value ? value.replace(/[^\d]/g, '') : '';
}

export function buildTenantPhoneHref(phone: string | null): string | null {
  const digits = toDigits(phone);
  return digits ? `tel:${digits}` : null;
}

export function buildTenantWhatsappHref(whatsapp: string | null, fallbackPhone: string | null): string | null {
  const source = whatsapp || fallbackPhone;
  const digits = toDigits(source);
  if (!digits) return null;

  const normalized = digits.startsWith('972') ? digits : digits.replace(/^0/, '972');
  return normalized ? `https://wa.me/${normalized}` : null;
}
