// Razorpay is temporarily disabled. Static QR-based payment is active.
// import { NextResponse } from 'next/server';
// import { razorpay } from '@/lib/razorpay';
//
// export async function POST(request: Request) {
//   try {
//     const body = (await request.json()) as { amount?: number; receipt?: string };
//     const amount = Number(body.amount ?? 0);
//     const receipt = body.receipt?.trim();
//     if (!Number.isFinite(amount) || amount <= 0) {
//       return NextResponse.json({ error: 'A valid amount is required.' }, { status: 400 });
//     }
//     const order = await razorpay.orders.create({
//       amount: Math.round(amount * 100),
//       currency: 'INR',
//       receipt: receipt?.slice(0, 40),
//       payment_capture: true,
//     });
//     return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
//   } catch (error) {
//     console.error('Razorpay create-order error:', error);
//     return NextResponse.json({ error: 'Unable to create Razorpay order.' }, { status: 500 });
//   }
// }

export function POST() {
  return new Response(JSON.stringify({ error: 'Razorpay payments are currently disabled.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
