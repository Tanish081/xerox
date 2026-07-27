'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { supabaseBrowser } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function StudentSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setMessage('Enter a password (minimum 6 characters).');
      return;
    }

    setLoading(true);
    setMessage('');

    const response = await fetch('/api/student/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        user_type: 'student',
      }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok || payload.error) {
      setMessage(payload.error || 'Registration failed. Please try again.');
      return;
    }

    const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      setSuccess(true);
      setMessage('Account created. Sign in with your email and password.');
      return;
    }

    router.push('/student');
  }

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
        <Card className="mx-auto w-full max-w-md space-y-6 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-600">✓</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Welcome</h2>
          <p className="text-sm text-slate-600">{message}</p>
          <Button className="w-full rounded-xl" onClick={() => router.push('/student')}>
            Choose xerox center
          </Button>
          <Button variant="secondary" className="w-full rounded-xl" onClick={() => router.push('/student/login')}>
            Go to login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center py-12">
      <Card className="mx-auto w-full max-w-md space-y-6 p-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-700 hover:underline">
            PrintQ
          </Link>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Student sign up</h2>
          <p className="text-sm text-slate-600">Create an account. You’ll select your campus shop next.</p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
            />
          </div>

          {message ? <p className="text-sm font-medium text-rose-600">{message}</p> : null}

          <Button className="w-full rounded-xl" onClick={() => void handleSignUp()} disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/student/login" className="font-semibold text-brand-700 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}

