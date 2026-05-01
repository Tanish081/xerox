import { Suspense } from 'react';
import { StudentIdentifyClient } from '@/components/student/identify-client';

export default function StudentIdentifyPage() {
  return (
    <Suspense fallback={null}>
      <StudentIdentifyClient />
    </Suspense>
  );
}