import { Suspense } from 'react';
import { StudentDashboardClient } from '@/components/student/dashboard-client';

export default function StudentDashboardPage() {
  return (
    <Suspense fallback={null}>
      <StudentDashboardClient />
    </Suspense>
  );
}
