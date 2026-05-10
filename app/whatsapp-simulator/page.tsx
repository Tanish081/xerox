import { Suspense } from 'react';
import { WhatsAppSimulatorClient } from '@/components/test/whatsapp-simulator-client';

export default function WhatsAppSimulatorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading simulator...</div>}>
      <WhatsAppSimulatorClient />
    </Suspense>
  );
}
