"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { clearSelectedShop, clearStudentSession, getSelectedShop, setStudentSession } from '@/lib/student-session';
import { ensureShopSelectedForStudent } from '@/lib/student-route-guard';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function StudentIdentifyClient() {
  const router = useRouter();
  const [shopName, setShopName] = useState('');
  const [shopId, setShopId] = useState('');
  const [shopUpiId, setShopUpiId] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const ok = await ensureShopSelectedForStudent(router);
      if (!ok || cancelled) return;

      const selectedShop = getSelectedShop();
      if (!selectedShop) return;

      setShopName(selectedShop.name);
      setShopId(selectedShop.id);
      setShopUpiId(selectedShop.upi_id);
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function continueWithPhone() {
    setError('');

    if (!shopId) {
      setError('Choose a xerox center first.');
      return;
    }

    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      setError('Phone number is required.');
      return;
    }

    setLoading(true);
    const { supabaseBrowser } = await import('@/lib/supabase');
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session?.access_token) {
      setLoading(false);
      router.replace('/student/login');
      return;
    }

    const lookupResponse = await fetch('/api/student/lookup-phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ shop_id: shopId, phone: normalizedPhone }),
    });

    const lookupPayload = (await lookupResponse.json()) as {
      status?: string;
      student?: { id: string; name: string };
      error?: string;
    };

    setLoading(false);

    if (!lookupResponse.ok) {
      setError(lookupPayload.error ?? 'Lookup failed.');
      return;
    }

    if (lookupPayload.status === 'conflict') {
      setError('This phone is already registered at this center under a different account.');
      return;
    }

    if (lookupPayload.status === 'ok' && lookupPayload.student) {
      setStudentSession({
        studentId: lookupPayload.student.id,
        studentName: lookupPayload.student.name,
        shopId,
        shopName,
        shopUpiId,
      });
      router.push('/student/dashboard');
      return;
    }

    setNeedsProfile(true);
  }

  async function createProfileAndContinue() {
    setError('');

    if (!shopId) {
      setError('Choose a xerox center first.');
      return;
    }

    if (!name.trim() || !rollNo.trim()) {
      setError('Name and roll number are required.');
      return;
    }

    setLoading(true);
    const { supabaseBrowser } = await import('@/lib/supabase');
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session?.access_token) {
      setLoading(false);
      router.replace('/student/login');
      return;
    }

    const response = await fetch('/api/student/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: name.trim(),
        roll_no: rollNo.trim(),
        phone: phone.trim(),
        shop_id: shopId,
      }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok || payload.error) {
      setError(payload.error || 'Failed to create profile. Please try again.');
      return;
    }

    const data = payload.data;

    setStudentSession({
      studentId: data.id,
      studentName: data.name,
      shopId,
      shopName,
      shopUpiId,
    });
    router.push('/student/dashboard');
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
      <Card className="w-full max-w-sm space-y-6 p-6">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            🏪 {shopName || 'Loading center...'}
            <button
              type="button"
              className="text-brand-700 underline-offset-2 hover:underline"
              onClick={() => {
                clearStudentSession();
                clearSelectedShop();
                router.replace('/student');
              }}
            >
              Change
            </button>
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Enter your phone</h2>
            <p className="mt-2 text-sm text-slate-600">We’ll find your profile or create one in a single step.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="phone">Phone number</Label>
            <div className="flex overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-400">
              <span className="flex items-center border-r border-slate-200 px-4 text-sm font-semibold text-slate-600">+91</span>
              <Input
                id="phone"
                className="rounded-none bg-transparent ring-0 focus:bg-transparent"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setNeedsProfile(false);
                }}
                placeholder="98765 43210"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
          </div>

          <Button className="w-full rounded-xl" onClick={() => void continueWithPhone()} disabled={loading}>
            {loading ? 'Checking...' : 'Continue'}
          </Button>

          <div className={`space-y-4 overflow-hidden transition-all duration-300 ${needsProfile ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="mb-4 text-sm font-medium text-slate-700">New number detected. Complete your profile once.</p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <Label htmlFor="rollNo">Roll number</Label>
                  <Input id="rollNo" value={rollNo} onChange={(event) => setRollNo(event.target.value)} placeholder="College roll no." />
                </div>
                <Button className="w-full rounded-xl" onClick={() => void createProfileAndContinue()} disabled={loading}>
                  {loading ? 'Creating profile...' : 'Create profile and continue'}
                </Button>
              </div>
            </div>
          </div>

          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        </div>
      </Card>
    </div>
  );
}