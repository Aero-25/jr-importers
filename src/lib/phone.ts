/**
 * Turns a phone number as staff actually type it into the digits `wa.me` needs.
 *
 * Numbers get captured at the counter in whatever form the customer says them:
 * `081 144 7669`, `+264 81 144 7669`, `00264...`. `wa.me` accepts none of those
 * — it wants country code and digits only, and silently opens an empty chat
 * when given a local number, which looks like the link is broken.
 *
 * Namibia is assumed for bare local numbers, because that is who walks into the
 * shop; anything already carrying a country code is left alone.
 */
const NA = '264';

export function whatsappNumber(raw: string | null | undefined): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';

  // 00 is the international prefix dialled from a landline.
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith(NA)) return digits;

  // A national number: the trunk 0 is dropped when the country code goes on.
  if (digits.startsWith('0')) return NA + digits.replace(/^0+/, '');

  // Namibian mobiles are 9 digits without the trunk 0 (e.g. 811447669).
  if (digits.length === 9 && digits.startsWith('8')) return NA + digits;

  return digits;
}

/** True when the number looks dialable, so callers can refuse to send instead of opening a dead chat. */
export function isSendableNumber(raw: string | null | undefined): boolean {
  const n = whatsappNumber(raw);
  return n.length >= 10 && n.length <= 15;
}
