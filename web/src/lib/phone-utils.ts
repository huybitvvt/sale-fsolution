const PHONE_RE = /(?<!\d)(?:(?:\+|00)?84|0)(?:[\s.\-()]?\d){8,10}(?!\d)/g;
const VIETNAM_MOBILE_RE = /^0(?:3|5|7|8|9)\d{8}$/;
const VIETNAM_LANDLINE_RE = /^02\d{8,9}$/;

export function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('0084')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  if (VIETNAM_MOBILE_RE.test(digits) || VIETNAM_LANDLINE_RE.test(digits)) return digits;
  return '';
}

export function extractPhones(text: string): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const match of text.matchAll(PHONE_RE)) {
    const phone = normalizePhone(match[0]);
    if (phone && !seen.has(phone)) {
      seen.add(phone);
      phones.push(phone);
    }
  }
  return phones;
}

export function phonesForComment(row: { phone?: string; phones?: string[] }): string[] {
  if (row.phones?.length) return row.phones;
  if (row.phone) return [row.phone];
  return [];
}
