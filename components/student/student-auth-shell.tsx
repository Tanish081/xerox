'use client';

import { supabaseBrowser } from '@/lib/supabase';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const PUBLIC_PREFIXES = ['/student/login', '/student/signup'];

export function StudentAuthShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));

      if (isPublic) {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (session && (pathname === '/student/login' || pathname === '/student/signup')) {
          router.replace('/student');
          return;
        }
        if (!cancelled) setReady(true);
        return;
      }

      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session) {
        router.replace('/student/login');
        return;
      }

      if (!cancelled) setReady(true);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));

  if (!isPublic && !ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500" aria-busy>
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
