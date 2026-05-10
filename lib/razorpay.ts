import Razorpay from 'razorpay';

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * Creates a Razorpay Payment Link
 * @param amount Amount in INR (not paise, we will multiply by 100 here)
 * @param referenceId Your internal order ID
 * @param description Description of the payment
 * @param customer Contact details of the customer (name, contact)
 * @returns The payment link response
 */
export async function createPaymentLink({
  amount,
  referenceId,
  description,
  customer,
}: {
  amount: number;
  referenceId: string;
  description: string;
  customer: {
    name?: string;
    contact: string;
    email?: string;
  };
}) {
  try {
    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100, // Razorpay expects amount in paise
      currency: 'INR',
      accept_partial: false,
      reference_id: referenceId,
      description: description,
      customer: {
        name: customer.name || 'Student',
        contact: customer.contact,
        email: customer.email,
      },
      notify: {
        sms: false,
        email: false,
      },
      reminder_enable: false,
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/razorpay/callback?reference_id=${referenceId}`,
      callback_method: 'get',
    });

    return paymentLink;
  } catch (error) {
    console.error('Error creating Razorpay Payment Link:', error);
    throw error;
  }
}
