import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  isPaymentScreenshot,
  extractPaymentTime,
  extractRecipient,
  extractAmount,
} from '@/lib/payment-ocr';

const PAYMENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AMOUNT_TOLERANCE_INR = 2;            // allow ₹2 shortfall for rounding
const CLOCK_SKEW_MS = 5 * 60 * 1000;       // tolerate screenshots timestamped slightly in the "future"

/**
 * Verifies that an uploaded screenshot is a genuine, recent payment receipt.
 *
 * Unlike the previous implementation, every check is REQUIRED: a screenshot
 * that is not a payment receipt, or is missing an amount / timestamp, is
 * rejected outright (verified: false). The client cancels the draft order and
 * sends the student back to redo the payment step.
 */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  let body: {
    order_id?: string;
    student_id?: string;
    utr_number?: string;
    screenshot_path?: string | null;
    ocr_text?: string | null;
    // Legacy client-extracted fields (kept for backward compatibility)
    payment_time_iso?: string | null;
    extracted_recipient?: string | null;
    extracted_amount?: number | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const orderId = body.order_id?.trim();
  const studentId = body.student_id?.trim();
  const utrNumber = body.utr_number?.trim() ?? null;
  const screenshotPath = body.screenshot_path?.trim() ?? null;
  const ocrText = (body.ocr_text ?? '').trim();

  if (!orderId) {
    return NextResponse.json({ error: 'order_id is required.' }, { status: 400 });
  }

  // Fetch order + shop to get expected amount and shop config
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, shop_id, estimated_amount, student_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('upi_display_name')
    .eq('id', order.shop_id)
    .single();

  if (shopError || !shop) {
    return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
  }

  const shopDisplayName: string | null = (shop as any).upi_display_name ?? null;
  const expectedAmount: number = Number(order.estimated_amount ?? 0);

  // Re-extract everything server-side from the raw OCR text (authoritative).
  // Fall back to legacy client-provided values only when raw text is absent.
  const recipient = ocrText ? extractRecipient(ocrText) : body.extracted_recipient?.trim() ?? null;
  const amount = ocrText
    ? extractAmount(ocrText)
    : typeof body.extracted_amount === 'number'
      ? body.extracted_amount
      : null;
  const paymentTime = ocrText
    ? extractPaymentTime(ocrText)
    : body.payment_time_iso
      ? new Date(body.payment_time_iso)
      : null;

  const reject = (reason: string) => NextResponse.json({ verified: false, reason });

  // ── 0. Is this even a payment screenshot? ───────────────────────────────────
  // Requires the raw OCR text. Without recognisable payment markers we refuse.
  if (!ocrText || !isPaymentScreenshot(ocrText)) {
    return reject(
      'This does not look like a payment screenshot. Please upload the actual UPI/bank payment confirmation for this order.',
    );
  }

  // ── 1. Amount must be present and cover the order total ─────────────────────
  if (amount === null) {
    return reject('Could not read a payment amount from the screenshot. Please upload a clear payment confirmation.');
  }
  if (expectedAmount > 0 && amount < expectedAmount - AMOUNT_TOLERANCE_INR) {
    return reject(
      `Payment amount ₹${amount.toFixed(2)} is less than the order total ₹${expectedAmount.toFixed(2)}. Please pay the full amount.`,
    );
  }

  // ── 2. Timestamp must be present and within the payment window ──────────────
  if (!paymentTime || isNaN(paymentTime.getTime())) {
    return reject('Could not read a payment date/time from the screenshot. Please upload the payment confirmation screen.');
  }
  const diffMs = Date.now() - paymentTime.getTime();
  if (diffMs > PAYMENT_WINDOW_MS) {
    const minutesAgo = Math.round(diffMs / 60000);
    return reject(
      `Payment was made ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago. Screenshot must be uploaded within 10 minutes of payment.`,
    );
  }
  if (diffMs < -CLOCK_SKEW_MS) {
    return reject('The payment time on this screenshot is in the future. Please upload a valid payment confirmation.');
  }

  // ── 3. Recipient must match the shop (only when the shop configured a name) ─
  if (shopDisplayName) {
    if (!recipient) {
      return reject('Could not verify the payment recipient. Please upload a screenshot that shows who you paid.');
    }
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const recipientNorm = normalize(recipient);
    const expectedNorm = normalize(shopDisplayName);
    if (!recipientNorm.includes(expectedNorm) && !expectedNorm.includes(recipientNorm)) {
      return reject(
        `Payment was made to "${recipient}", not to this shop ("${shopDisplayName}"). Please pay the correct UPI ID and re-upload.`,
      );
    }
  }

  // ── All checks passed — mark order verified ─────────────────────────────────
  const updateFields: Record<string, unknown> = { payment_verified: true };
  if (utrNumber) updateFields.utr_number = utrNumber;
  updateFields.payment_initiated_at = paymentTime.toISOString();
  if (screenshotPath) updateFields.payment_screenshot_url = screenshotPath;

  const query = supabaseAdmin.from('orders').update(updateFields).eq('id', orderId);
  if (studentId) query.eq('student_id', studentId);
  const { error: dbError } = await query;
  if (dbError) console.error('verify-payment DB update error:', dbError);

  return NextResponse.json({ verified: true, message: 'Payment verified. You can now submit your order.' });
}
