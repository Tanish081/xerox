// Razorpay is temporarily disabled. Static QR-based payment is active.
// import crypto from 'crypto';
// import { NextResponse } from 'next/server';
//
// export async function POST(request: Request) {
//   try {
//     const body = (await request.json()) as {
//       razorpay_order_id?: string;
//       razorpay_payment_id?: string;
//       razorpay_signature?: string;
//     };
//     const orderId = body.razorpay_order_id?.trim();
//     const paymentId = body.razorpay_payment_id?.trim();
//     const signature = body.razorpay_signature?.trim();
//     if (!orderId || !paymentId || !signature) {
//       return NextResponse.json({ error: 'Missing Razorpay verification fields.' }, { status: 400 });
//     }
//     const secret = process.env.RAZORPAY_KEY_SECRET;
//     if (!secret) {
//       return NextResponse.json({ error: 'Razorpay secret is not configured.' }, { status: 500 });
//     }
//     const expectedSignature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
//     if (expectedSignature !== signature) {
//       return NextResponse.json({ verified: false, error: 'Signature verification failed.' }, { status: 400 });
//     }
//     return NextResponse.json({ verified: true, paymentId, orderId });
//   } catch (error) {
//     console.error('Razorpay verify error:', error);
//     return NextResponse.json({ error: 'Unable to verify payment.' }, { status: 500 });
//   }
// }

export function POST() {
  return new Response(JSON.stringify({ error: 'Razorpay payments are currently disabled.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
