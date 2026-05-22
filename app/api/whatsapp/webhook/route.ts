import { NextRequest, NextResponse } from 'next/server';
// Razorpay is temporarily disabled. Payment links via WhatsApp are paused.
// import { createPaymentLink } from '@/lib/razorpay';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'printq_whatsapp_test_token';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return new NextResponse(challenge, { status: 200 });
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const senderPhone = message.from;

            if (message.type === 'document') {
              const document = message.document;
              const documentId = document.id;
              console.log(`Received document from ${senderPhone} with ID: ${documentId}`);

              // TODO: When Razorpay is re-enabled, generate a payment link here.
              // For now, static QR-based payment is in use on the web portal.
              console.log('WhatsApp payment link generation is paused (Razorpay disabled).');
            } else if (message.type === 'text') {
              console.log(`Received text from ${senderPhone}: ${message.text.body}`);
            }
          }
        }
      }

      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    return NextResponse.json({ error: 'Not a WhatsApp webhook' }, { status: 404 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
