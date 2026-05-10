import { Suspense } from 'react';
import { StorefrontClient } from '@/components/student/storefront-client';

export default function StorefrontPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading storefront...</div>}>
      <StorefrontClient />
    </Suspense>
  );
}
