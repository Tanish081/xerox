"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { setStudentSession } from '@/lib/student-session';
import { supabaseBrowser } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function StudentEntryClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shopId = searchParams.get('shop') ?? '';

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [needsProfile, setNeedsProfile] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function continueWithPhone() {
    setError('');

    if (!shopId) {
      setError('Missing shop id. Open this page with ?shop=SHOP_ID');
      return;
    }

    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }

    setLoading(true);

    const { data, error: lookupError } = await supabaseBrowser
      .from('students')
      .select('id,name,roll_no,phone')
      .eq('shop_id', shopId)
      .eq('phone', phone.trim())
      .maybeSingle();

    setLoading(false);

    if (lookupError) {
      setError(lookupError.message);
      return;
    }

    if (data?.id) {
      const { data: shop } = await supabaseBrowser.from('shops').select('name,upi_id').eq('id', shopId).maybeSingle();
      setStudentSession({
        studentId: data.id,
        studentName: data.name ?? 'Student',
        shopId,
        shopName: shop?.name ?? 'Selected center',
        shopUpiId: shop?.upi_id ?? '',
      });
      router.push('/student/dashboard');
      return;
    }

    setNeedsProfile(true);
  }

  async function createProfileAndContinue() {
    setError('');

    if (!name.trim() || !rollNo.trim()) {
      setError('Name and roll number are required.');
      return;
    }

    setLoading(true);

    const studentId = crypto.randomUUID();
    const { data, error: createError } = await supabaseBrowser
      .from('students')
      .insert({
        id: studentId,
        name: name.trim(),
        roll_no: rollNo.trim(),
        phone: phone.trim(),
        shop_id: shopId,
      })
      .select('id')
      .single();

    setLoading(false);

    if (createError) {
      setError(createError.message);
      return;
    }

    const { data: shop } = await supabaseBrowser.from('shops').select('name,upi_id').eq('id', shopId).maybeSingle();
    setStudentSession({
      studentId: data.id,
      studentName: name.trim(),
      shopId,
      shopName: shop?.name ?? 'Selected center',
      shopUpiId: shop?.upi_id ?? '',
    });
    router.push('/student/dashboard');
  }

  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="font-[var(--font-space-grotesk)] text-3xl font-semibold text-slate-950">Student entry</h2>
        <p className="mt-2 text-sm text-slate-600">Use your phone number to continue. No login required.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit number" />
        </div>

        {!needsProfile ? (
          <Button className="w-full" onClick={() => void continueWithPhone()} disabled={loading}>
            {loading ? 'Checking...' : 'Continue'}
          </Button>
        ) : (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">New number detected. Complete your profile once.</p>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="rollNo">Roll number</Label>
              <Input id="rollNo" value={rollNo} onChange={(event) => setRollNo(event.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void createProfileAndContinue()} disabled={loading}>
              {loading ? 'Creating profile...' : 'Create profile and continue'}
            </Button>
          </div>
        )}

        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      </div>
    </Card>
  );
}
