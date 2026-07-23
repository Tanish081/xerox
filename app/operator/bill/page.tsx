import { Suspense } from 'react';
import { BillClient } from '@/components/operator/bill-client';

export default function OperatorBillPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading…</div>}>
      <BillClient />
    </Suspense>
  );
}
