"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { supabaseBrowser } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function StudentRegisterClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shopId = searchParams.get('shop') ?? '';
  const [form, setForm] = useState({ name: '', roll_no: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shopId) {
      setError('Missing shop ID in URL.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !user) {
        setError(userError?.message ?? 'Sign in is required before student registration.');
        setLoading(false);
        return;
      }

      const { data, error: insertError } = await supabaseBrowser
        .from('students')
        .upsert(
          {
            id: user.id,
            name: form.name,
            roll_no: form.roll_no,
            phone: form.phone,
            shop_id: shopId,
          },
          { onConflict: 'id' },
        )
        .select('id')
        .single();

      setLoading(false);

      if (insertError) {
        setError(insertError.message);
        return;
      }

      router.push(`/student/dashboard?student=${data.id}&shop=${shopId}`);
    } catch (unexpectedError) {
      setLoading(false);
      setError(unexpectedError instanceof Error ? unexpectedError.message : 'Unexpected error while creating student profile.');
    }
  }

  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="font-[var(--font-space-grotesk)] text-3xl font-semibold text-slate-950">Register student</h2>
        <p className="mt-2 text-sm text-slate-600">Enter your details to start placing print orders.</p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </div>
        <div>
          <Label htmlFor="roll_no">Roll number</Label>
          <Input id="roll_no" value={form.roll_no} onChange={(event) => setForm((current) => ({ ...current, roll_no: event.target.value }))} required />
        </div>
        <div>
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required />
        </div>
        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        <Button className="w-full" disabled={loading} type="submit">
          {loading ? 'Registering...' : 'Continue'}
        </Button>
      </form>
    </Card>
  );
}
