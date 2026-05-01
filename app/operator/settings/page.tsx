"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { supabaseBrowser } from '@/lib/supabase';
import { useState } from 'react';

export default function OperatorSettingsPage() {
  const [shopId, setShopId] = useState('');
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [avgTime, setAvgTime] = useState(3);
  const [isOpen, setIsOpen] = useState(true);

  async function saveSettings() {
    if (!shopId) return;
    await supabaseBrowser.from('shops').update({ name, upi_id: upiId, avg_time_per_10_pages: avgTime, is_open: isOpen }).eq('id', shopId);
  }

  return (
    <Card className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="font-[var(--font-space-grotesk)] text-3xl font-semibold text-slate-950">Shop settings</h2>
        <p className="mt-2 text-sm text-slate-600">Update the active shop configuration.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label>Shop ID</Label><Input value={shopId} onChange={(event) => setShopId(event.target.value)} /></div>
        <div><Label>Shop name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div><Label>UPI ID</Label><Input value={upiId} onChange={(event) => setUpiId(event.target.value)} /></div>
        <div><Label>Avg time per 10 pages</Label><Input type="number" min={1} value={avgTime} onChange={(event) => setAvgTime(Number(event.target.value))} /></div>
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} />
        Shop open
      </label>
      <Button onClick={saveSettings}>Save settings</Button>
    </Card>
  );
}
