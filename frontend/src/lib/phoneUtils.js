/**
 * phoneUtils.js
 *
 * Utilities for normalising customer phone numbers into the format required
 * by the WhatsApp click-to-chat URL scheme (wa.me).
 *
 * wa.me expects: digits only, including country code, no leading +, spaces,
 * hyphens, or brackets.
 *
 * Example:  +60 12-345 6789  →  https://wa.me/60123456789
 */

/**
 * The default country code used when a phone number begins with "0"
 * (i.e. a local number without an explicit country code).
 *
 * Configured via the VITE_DEFAULT_PHONE_COUNTRY_CODE environment variable.
 * Falls back to "60" (Malaysia) if the variable is not set.
 *
 * To override, add to your .env file:
 *   VITE_DEFAULT_PHONE_COUNTRY_CODE=65
 */
const DEFAULT_COUNTRY_CODE =
    (import.meta.env.VITE_DEFAULT_PHONE_COUNTRY_CODE || '60').replace(/\D/g, '');

/**
 * Normalises a raw phone number string into an international digits-only
 * string suitable for use in a wa.me URL.
 *
 * Rules applied in order:
 *  1. Returns null for null, undefined, or empty string.
 *  2. If the number begins with "+", the "+" is stripped; everything after
 *     it is treated as an already-internationalised number.
 *  3. All remaining non-digit characters (spaces, hyphens, brackets, dots)
 *     are stripped.
 *  4. If the resulting digits begin with "0", the leading "0" is replaced
 *     with the configured default country code.
 *  5. Returns null if the final digit string has fewer than 7 digits
 *     (clearly not a valid phone number).
 *
 * @param {string|null|undefined} phoneNumber - Raw phone number from customer record.
 * @param {string} [countryCode] - Optional override country code (digits only, no "+").
 * @returns {string|null} Normalised digits-only string, or null if invalid.
 *
 * @example
 * normalisePhoneNumber('+60 12-345 6789') // '60123456789'
 * normalisePhoneNumber('0123456789')       // '60123456789'  (with DEFAULT_COUNTRY_CODE=60)
 * normalisePhoneNumber('60123456789')      // '60123456789'
 * normalisePhoneNumber('(012) 345-6789')   // '60123456789'
 * normalisePhoneNumber(null)               // null
 * normalisePhoneNumber('')                 // null
 * normalisePhoneNumber('abc')              // null
 */
export function normalisePhoneNumber(phoneNumber, countryCode) {
    if (phoneNumber == null || phoneNumber === '') return null;

    const cc = (countryCode || DEFAULT_COUNTRY_CODE).replace(/\D/g, '');
    let raw = String(phoneNumber).trim();

    // Strip leading "+" — the rest is already in international format
    if (raw.startsWith('+')) {
        raw = raw.slice(1);
    }

    // Remove all remaining non-digit characters
    const digits = raw.replace(/\D/g, '');

    if (!digits) return null;

    // Local number starting with 0 — replace leading 0 with country code
    const normalised = digits.startsWith('0') ? cc + digits.slice(1) : digits;

    // Reject numbers that are clearly too short to be valid
    if (normalised.length < 7) return null;

    return normalised;
}

/**
 * Generates a WhatsApp click-to-chat URL for the given phone number.
 *
 * Opens the WhatsApp conversation for the customer. The salesperson must
 * then press the voice-call icon inside WhatsApp manually — this link
 * cannot initiate or confirm a call automatically.
 *
 * @param {string|null|undefined} phoneNumber - Raw phone number from customer record.
 * @param {string} [countryCode] - Optional override country code (digits only, no "+").
 * @returns {string|null} Full wa.me URL, e.g. "https://wa.me/60123456789", or null.
 *
 * @example
 * generateWhatsAppUrl('+60 12-345 6789') // 'https://wa.me/60123456789'
 * generateWhatsAppUrl('0123456789')       // 'https://wa.me/60123456789'
 * generateWhatsAppUrl(null)               // null
 */
export function generateWhatsAppUrl(phoneNumber, countryCode) {
    const normalised = normalisePhoneNumber(phoneNumber, countryCode);
    if (!normalised) return null;
    return `https://wa.me/${normalised}`;
}
