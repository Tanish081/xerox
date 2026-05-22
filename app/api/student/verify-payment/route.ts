import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const PAYMENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AMOUNT_TOLERANCE_INR = 2;            // allow ₹2 shortfall for rounding

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  let body: {
    order_id?: string;
    student_id?: string;
    utr_number?: string;
    screenshot_path?: string | null;
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
  const paymentTimeIso = body.payment_time_iso ?? null;
  const extractedRecipient = body.extracted_recipient?.trim() ?? null;
  const extractedAmount = typeof body.extracted_amount === 'number' ? body.extracted_amount : null;

  if (!orderId) {
    return NextResponse.json({ error: 'order_id is required.' }, { status: 400 });
  }

  // Fetch order + shop in one query to get expected amount and shop config
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

  // ── 1. Recipient check ──────────────────────────────────────────────────────
  // Only runs when both the shop has configured a display name AND OCR found a recipient
  if (shopDisplayName && extractedRecipient) {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const recipientNorm = normalize(extractedRecipient);
    const expectedNorm = normalize(shopDisplayName);

    // Check if the expected name appears within the extracted recipient text
    if (!recipientNorm.includes(expectedNorm) && !expectedNorm.includes(recipientNorm)) {
      return NextResponse.json({
        verified: false,
        reason: `Payment was made to "${extractedRecipient}", not to this shop ("${shopDisplayName}"). Please pay the correct UPI ID and re-upload.`,
      });
    }
  }

  // ── 2. Amount check ─────────────────────────────────────────────────────────
  // Only runs when OCR found an amount and the order has a non-zero expected amount
  if (extractedAmount !== null && expectedAmount > 0) {
    if (extractedAmount < expectedAmount - AMOUNT_TOLERANCE_INR) {
      return NextResponse.json({
        verified: false,
        reason: `Payment amount ₹${extractedAmount.toFixed(2)} is less than the order total ₹${expectedAmount.toFixed(2)}. Please pay the full amount.`,
      });
    }
  }

  // ── 3. Time-window check ────────────────────────────────────────────────────
  if (paymentTimeIso) {
    const paymentTime = new Date(paymentTimeIso);
    const uploadTime = new Date();

    if (!isNaN(paymentTime.getTime())) {
      const diffMs = uploadTime.getTime() - paymentTime.getTime();
      if (diffMs > PAYMENT_WINDOW_MS) {
        const minutesAgo = Math.round(diffMs / 60000);
        return NextResponse.json({
          verified: false,
          reason: `Payment was made ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago. Screenshot must be uploaded within 10 minutes of payment.`,
        });
      }
    }
  }

  // ── All checks passed — mark order verified ─────────────────────────────────
  const updateFields: Record<string, unknown> = { payment_verified: true };
  if (utrNumber) updateFields.utr_number = utrNumber;
  if (paymentTimeIso) updateFields.payment_initiated_at = paymentTimeIso;
  if (screenshotPath) updateFields.payment_screenshot_url = screenshotPath;

  const query = supabaseAdmin.from('orders').update(updateFields).eq('id', orderId);
  if (studentId) query.eq('student_id', studentId);
  const { error: dbError } = await query;
  if (dbError) console.error('verify-payment DB update error:', dbError);

  return NextResponse.json({ verified: true, message: 'Payment verified. You can now submit your order.' });
}
