import { Suspense } from 'react';
import { NewOrderClientPolished } from '@/components/student/new-order-client-polished';

export default function NewOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewOrderClientPolished />
    </Suspense>
  );
}
