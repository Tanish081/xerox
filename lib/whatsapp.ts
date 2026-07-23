import type { Order } from '@/types';
import { displayToken } from '@/lib/token';

/**
 * Normalises a phone number to the digits `wa.me` expects (country code, no `+`).
 * Defaults to India (+91) for bare 10-digit numbers. Returns null if unusable.
 */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10) return `91${digits}`;                          // 9876543210
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`; // 09876543210
  if (digits.length === 12 && digits.startsWith('91')) return digits;      // 919876543210
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1);      // 0919876543210

  return digits.length >= 11 ? digits : null; // assume it already has a country code
}

/**
 * The default "your print is ready, please collect" message for an order.
 */
export function orderReadyMessage(order: Order, shopName?: string): string {
  const name = order.student?.name?.trim() || 'there';
  const token = displayToken(order.token) || 'your order';
  const shop = shopName?.trim();
  return (
    `Hi ${name}, your print order ${token}${shop ? ` at ${shop}` : ''} is ready. ` +
    `Please collect it from the shop. Thank you!`
  );
}

/**
 * Collection message for a department (staff) order the operator has finished
 * printing. Staff verify the job against these details before collecting.
 */
export function departmentOrderDoneMessage(order: Order, shopName?: string): string {
  const name = order.placed_by_name?.trim() || order.student?.name?.trim() || 'there';
  const token = displayToken(order.token) || 'your order';
  const shop = shopName?.trim();
  const pages = order.total_pages ? `${order.total_pages} page${order.total_pages === 1 ? '' : 's'}` : null;
  const dept = order.billed_department?.trim();

  return (
    `Hi ${name}, your print request ${token}${shop ? ` at ${shop}` : ''} is printed and ready.` +
    `${pages ? ` (${pages})` : ''}` +
    `${dept ? ` Billed to ${dept}.` : ''}` +
    ` Please verify the printout and collect it from the counter. Thank you!`
  );
}

/**
 * Click-to-send `wa.me` URL for the department-order collection message.
 * Returns null if the staff member has no usable phone number.
 */
export function buildDepartmentOrderDoneWhatsAppUrl(order: Order, shopName?: string): string | null {
  const phone = normalizePhoneForWhatsApp(order.student?.phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(departmentOrderDoneMessage(order, shopName))}`;
}

/**
 * Builds a click-to-send `wa.me` URL that opens WhatsApp with the order-ready
 * message pre-filled to the student's number. Returns null if the student has
 * no usable phone number.
 */
export function buildOrderReadyWhatsAppUrl(order: Order, shopName?: string): string | null {
  const phone = normalizePhoneForWhatsApp(order.student?.phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(orderReadyMessage(order, shopName))}`;
}
