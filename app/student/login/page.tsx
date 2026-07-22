'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { supabaseBrowser } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function StudentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function signInDirect() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
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

    setMessage('Signed in. Redirecting...');
    router.push('/student');
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
      <Card className="mx-auto w-full max-w-md space-y-6 p-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-700">PrintQ</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Student login</h2>
          <p className="text-sm text-slate-600">Sign in with email and password, then choose your xerox center.</p>
        </div>
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
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          <Button className="w-full rounded-xl" onClick={() => void signInDirect()} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <p className="text-center text-sm text-slate-600">
            New here?{' '}
            <Link href="/student/signup" className="font-semibold text-brand-700 hover:underline">
              Create an account
            </Link>
          </p>
          <p className="text-center text-sm text-slate-600">
            Faculty or admin staff?{' '}
            <Link href="/staff/login" className="font-semibold text-brand-700 hover:underline">
              Use the staff login
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
