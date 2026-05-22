/**
 * Extracts the recipient name from OCR text.
 * Looks for "Paid to\n[NAME]" (Google Pay) and similar patterns.
 * Returns null if not found.
 */
export function extractRecipient(text: string): string | null {
  // "Paid to\nVrishabh Chadchan"  ← Google Pay success screen
  const paidToNewline = text.match(/paid\s+to\s*[\n\r]+\s*([A-Za-z][^\n\r₹\d]{2,50})/i);
  if (paidToNewline) return paidToNewline[1].trim();

  // "Paid to Vrishabh Chadchan" on same line
  const paidToInline = text.match(/paid\s+to[:\s]+([A-Za-z][^\n\r₹\d,]{2,50})/i);
  if (paidToInline) return paidToInline[1].trim();

  // "To: [NAME]" or "To [NAME]"
  const toPattern = text.match(/\bto[:\s]+([A-Za-z][^\n\r₹\d,]{2,50})/i);
  if (toPattern) return toPattern[1].trim();

  return null;
}

/**
 * Extracts the primary payment amount (INR) from OCR text.
 * Returns null if not found.
 */
export function extractAmount(text: string): number | null {
  // ₹1.00 / ₹ 1,000.00 / ₹25
  const rupeeSigns = [...text.matchAll(/₹\s*([\d,]+(?:\.\d{1,2})?)/g)];
  if (rupeeSigns.length > 0) {
    const amounts = rupeeSigns
      .map((m) => parseFloat(m[1].replace(/,/g, '')))
      .filter((a) => !isNaN(a) && a > 0);
    if (amounts.length > 0) return amounts[0]; // first ₹-prefixed amount is the main one
  }

  // OCR sometimes misreads ₹ — look for a standalone decimal number that looks like money
  const standalone = [...text.matchAll(/\b(\d{1,6}\.\d{2})\b/g)];
  if (standalone.length > 0) {
    const amounts = standalone
      .map((m) => parseFloat(m[1]))
      .filter((a) => a > 0 && a < 100000);
    if (amounts.length > 0) return amounts[0];
  }

  return null;
}

/**
 * Extracts the earliest recognisable payment timestamp from raw OCR text.
 * Handles common Indian UPI receipt formats:
 *   "22 May 2026, 2:19 pm"   ← Google Pay
 *   "Today, 2:19 PM"
 *   "2:19 PM"
 *   "2026-05-22 14:19"
 *   "14:19:05"
 */
export function extractPaymentTime(text: string): Date | null {
  const now = new Date();

  // "22 May 2026, 2:19 pm"  or  "22 May 2026 2:19 PM"
  const fullDate = text.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
  if (fullDate) {
    const [, day, mon, year, hr, min, sec, ampm] = fullDate;
    let h = Number(hr);
    if (ampm?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm?.toLowerCase() === 'am' && h === 12) h = 0;
    const d = new Date(
      Number(year),
      ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mon.toLowerCase()),
      Number(day), h, Number(min), Number(sec ?? 0),
    );
    if (!isNaN(d.getTime())) return d;
  }

  // ISO-like: "2026-05-22 14:19" or "2026-05-22T14:19"
  const iso = text.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (iso) {
    const d = new Date(`${iso[1]}T${iso[2]}:${iso[3]}:${iso[4] ?? '00'}`);
    if (!isNaN(d.getTime())) return d;
  }

  // "Today, 2:19 PM" — date is today
  const today = text.match(/today[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (today) {
    const [, hr, min, sec, ampm] = today;
    let h = Number(hr);
    if (ampm?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm?.toLowerCase() === 'am' && h === 12) h = 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, Number(min), Number(sec ?? 0));
    if (!isNaN(d.getTime())) return d;
  }

  // Bare 12-hr time "2:19 pm" — assume today
  const bareTime = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (bareTime) {
    const [, hr, min, sec, ampm] = bareTime;
    let h = Number(hr);
    if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, Number(min), Number(sec ?? 0));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}
