import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; reason: 'unparseable' | 'wrong_length' | 'unknown_operator' };

/**
 * Belarusian national numbers are 9 digits. Mobile operators use 25, 29, 33, 44;
 * landline area codes start with 1 or 2.
 *
 * libphonenumber's strict isValid() rejects the placeholder numbers from the
 * assignment (+375 29 000-00-21), so we check length via isPossible() plus the
 * operator/area prefix instead.
 */
const BY_PREFIX = /^(?:1|2|33|44)/;

export function normalizePhone(raw: string, defaultCountry: CountryCode = 'BY'): PhoneResult {
  const phone = parsePhoneNumberFromString(raw, defaultCountry);
  if (!phone) return { ok: false, reason: 'unparseable' };
  if (!phone.isPossible()) return { ok: false, reason: 'wrong_length' };

  if (phone.country === 'BY' || phone.countryCallingCode === '375') {
    const national = phone.nationalNumber;
    if (national.length !== 9) return { ok: false, reason: 'wrong_length' };
    if (!BY_PREFIX.test(national)) return { ok: false, reason: 'unknown_operator' };
    return { ok: true, e164: phone.number, display: formatBelarusian(national) };
  }

  return { ok: true, e164: phone.number, display: phone.formatInternational() };
}

/** 290000021 -> +375 (29) 000-00-21 */
function formatBelarusian(national: string): string {
  const code = national.slice(0, 2);
  const rest = national.slice(2);
  return `+375 (${code}) ${rest.slice(0, 3)}-${rest.slice(3, 5)}-${rest.slice(5, 7)}`;
}
