import { NextRequest, NextResponse } from 'next/server';
import { createPaymentLink } from '@/lib/razorpay';
// import { createClient } from '@/lib/supabase/server'; // Assumed Supabase client setup

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'printq_whatsapp_test_token';

// Handle Webhook Verification from Meta
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

// Handle Incoming WhatsApp Messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if it's a WhatsApp status update or message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const senderPhone = message.from; // Phone number of the user

            // Check if the message is a document (PDF)
            if (message.type === 'document') {
              const document = message.document;
              const documentId = document.id;
              
              console.log(`Received document from ${senderPhone} with ID: ${documentId}`);
              
              // TODO:
              // 1. Download document from Meta API using documentId
              // 2. Upload to Supabase print-files bucket
              // 3. Count pages
              // 4. Create Order in Supabase
              
              // Example: Mock Cost Calculation
              const estimatedAmount = 20; // Hardcoded for now
              
              // 5. Generate Razorpay Payment Link
              const paymentLink = await createPaymentLink({
                amount: estimatedAmount,
                referenceId: `order_${Date.now()}`, // Replace with actual order ID
                description: 'PrintQ Document Printing',
                customer: {
                  contact: senderPhone,
                }
              });

              // 6. Send reply message back to user via WhatsApp Cloud API
              // We need the WHATSAPP_ACCESS_TOKEN and PHONE_NUMBER_ID for this
              console.log(`Generated payment link: ${paymentLink.short_url}`);
              
            } else if (message.type === 'text') {
              // Handle simple text messages
              console.log(`Received text from ${senderPhone}: ${message.text.body}`);
            }
          }
        }
      }
      
      // Return a 200 OK to Meta
      return NextResponse.json({ status: 'success' }, { status: 200 });
    }

    return NextResponse.json({ error: 'Not a WhatsApp webhook' }, { status: 404 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
