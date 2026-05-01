import { Suspense } from 'react';
import { OperatorDashboardClient } from '@/components/operator/dashboard-client';

export default function OperatorDashboardPage() {
  return (
    <Suspense fallback={null}>
      <OperatorDashboardClient />
    </Suspense>
  );
}
