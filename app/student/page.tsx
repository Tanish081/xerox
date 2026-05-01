import { Suspense } from 'react';
import { StudentShopPickerClient } from '@/components/student/shop-picker-client';

export default function StudentEntryPage() {
  return (
    <Suspense fallback={null}>
      <StudentShopPickerClient />
    </Suspense>
  );
}
