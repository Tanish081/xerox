'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { clearSelectedShop, clearStudentSession, setUserType } from '@/lib/student-session';
import { supabaseBrowser } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function StaffLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // An existing session is surfaced, never silently redirected — bouncing
  // signed-in visitors is what made the staff area unreachable before.
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!cancelled && session?.user?.email) setSignedInAs(session.user.email);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setMessage('Enter your password (minimum 6 characters).');
      return;
    }

    setLoading(true);
    setMessage('');

    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    // Drop any profile/shop left over from a previous account so the staff
    // member starts at the center picker rather than someone else's session.
    clearStudentSession();
    clearSelectedShop();
    setUserType('staff');
    router.push('/student');
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    clearStudentSession();
    clearSelectedShop();
    setSignedInAs(null);
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
      <Card className="mx-auto w-full max-w-md space-y-6 p-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-700">PrintQ</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Staff login</h2>
          <p className="text-sm text-slate-600">Sign in with your email and password, then choose your xerox center.</p>
        </div>

        {signedInAs ? (
          <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p>
              You are already signed in as <span className="font-semibold">{signedInAs}</span>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                className="rounded-xl"
                onClick={() => {
                  setUserType('staff');
                  router.push('/student');
                }}
              >
                Continue
              </Button>
              <Button variant="secondary" className="rounded-xl" onClick={() => void signOut()}>
                Use another account
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@college.edu"
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          {message ? <p className="text-sm font-medium text-rose-600">{message}</p> : null}

          <Button className="w-full rounded-xl" onClick={() => void signIn()} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>

          <p className="text-center text-xs text-slate-500">
            Use the shared email &amp; password your department was given. Don&rsquo;t have it? Ask your xerox operator.
          </p>
        </div>
      </Card>
    </div>
  );
}
