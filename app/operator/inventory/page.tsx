import { Suspense } from 'react';
import { OperatorInventoryClient } from '@/components/operator/inventory-client';

export default function OperatorInventoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading inventory...</div>}>
      <OperatorInventoryClient />
    </Suspense>
  );
}
