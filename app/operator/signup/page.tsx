"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function OperatorSignupPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!shopName.trim() || !upiId.trim()) {
      setMessage('Shop Name and UPI ID are required.');
      return;
    }

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

    // Call backend API which uses the admin key to create + auto-confirm the user
    const response = await fetch('/api/operator/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName: shopName.trim(),
        upiId: upiId.trim(),
        email: normalizedEmail,
        password,
      }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok || payload.error) {
      setMessage(payload.error || 'Registration failed. Please try again.');
      return;
    }

    setSuccess(true);
    setMessage('Shop registered successfully! You can now log in.');
  }

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
        <Card className="mx-auto w-full max-w-md space-y-6 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-600">✓</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Registration Complete</h2>
          <p className="text-sm text-slate-600">{message}</p>
          <Button className="w-full rounded-xl" onClick={() => router.push('/operator/login')}>
            Go to Login
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
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Register Shop</h2>
          <p className="text-sm text-slate-600">Create an operator account for your xerox center.</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="shopName">Shop Name</Label>
            <Input id="shopName" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Vijay Xerox" />
          </div>
          <div>
            <Label htmlFor="upiId">Shop UPI ID</Label>
            <Input id="upiId" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. shop@ybl" />
          </div>
          <div>
            <Label htmlFor="email">Operator Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" />
          </div>
          
          {message && <p className="text-sm font-medium text-rose-600">{message}</p>}
          
          <Button className="w-full rounded-xl" onClick={handleSignUp} disabled={loading}>
            {loading ? 'Registering...' : 'Create Account'}
          </Button>

          <p className="text-center text-sm text-slate-600">
            Already have an account? <Link href="/operator/login" className="font-semibold text-brand-700 hover:underline">Log in</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
