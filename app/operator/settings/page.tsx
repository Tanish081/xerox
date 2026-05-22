"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { useEffect, useRef, useState } from 'react';

export default function OperatorSettingsPage() {
  const [shopId, setShopId] = useState('');
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [avgTime, setAvgTime] = useState(3);
  const [isOpen, setIsOpen] = useState(true);
  const [upiDisplayName, setUpiDisplayName] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // QR code state
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrDeleting, setQrDeleting] = useState(false);
  const [qrMessage, setQrMessage] = useState('');
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const { supabaseBrowser } = await import('@/lib/supabase');
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const token = session?.access_token ?? '';
      setAuthToken(token);
      if (!token) return;

      const res = await fetch('/api/operator/shops', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json()) as { data?: any[]; error?: string };
      const firstShop = payload.data?.[0];
      if (!firstShop) return;

      setShopId(firstShop.id ?? '');
      setName(firstShop.name ?? '');
      setUpiId(firstShop.upi_id ?? '');
      setAvgTime(firstShop.avg_time_per_10_pages ?? 3);
      setIsOpen(firstShop.is_open ?? true);
      setCurrentQrUrl(firstShop.payment_qr_url ?? null);
      setUpiDisplayName(firstShop.upi_display_name ?? '');
    })();
  }, []);

  function handleQrFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setQrFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setQrPreview(url);
    } else {
      setQrPreview(null);
    }
  }

  async function handleQrUpload() {
    if (!shopId || !qrFile || !authToken) return;
    setQrUploading(true);
    setQrMessage('');

    const formData = new FormData();
    formData.append('shopId', shopId);
    formData.append('qrImage', qrFile);

    const res = await fetch('/api/operator/qr-code', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    const payload = (await res.json()) as { payment_qr_url?: string; error?: string };
    setQrUploading(false);

    if (!res.ok || !payload.payment_qr_url) {
      setQrMessage(payload.error ?? 'Upload failed.');
      return;
    }

    setCurrentQrUrl(payload.payment_qr_url);
    setQrFile(null);
    setQrPreview(null);
    if (qrInputRef.current) qrInputRef.current.value = '';
    setQrMessage('QR code uploaded successfully.');
  }

  async function handleQrDelete() {
    if (!shopId || !authToken) return;
    setQrDeleting(true);
    setQrMessage('');

    const res = await fetch('/api/operator/qr-code', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId }),
    });

    const payload = (await res.json()) as { success?: boolean; error?: string };
    setQrDeleting(false);

    if (!res.ok) {
      setQrMessage(payload.error ?? 'Delete failed.');
      return;
    }

    setCurrentQrUrl(null);
    setQrMessage('QR code removed.');
  }

  async function saveSettings() {
    if (!shopId || !authToken) return;
    setSaving(true);
    setSaveMessage('');

    const { supabaseBrowser } = await import('@/lib/supabase');
    const { error } = await supabaseBrowser
      .from('shops')
      .update({ name, upi_id: upiId, upi_display_name: upiDisplayName.trim() || null, avg_time_per_10_pages: avgTime, is_open: isOpen })
      .eq('id', shopId);

    setSaving(false);
    setSaveMessage(error ? `Error: ${error.message}` : 'Settings saved.');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* General settings */}
      <Card className="space-y-5">
        <div>
          <h2 className="font-[var(--font-space-grotesk)] text-3xl font-semibold text-slate-950">Shop settings</h2>
          <p className="mt-2 text-sm text-slate-600">Update the active shop configuration.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>Shop ID</Label><Input value={shopId} onChange={(event) => setShopId(event.target.value)} /></div>
          <div><Label>Shop name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div><Label>UPI ID</Label><Input value={upiId} onChange={(event) => setUpiId(event.target.value)} /></div>
          <div>
            <Label>UPI display name</Label>
            <Input
              value={upiDisplayName}
              onChange={(event) => setUpiDisplayName(event.target.value)}
              placeholder="e.g. Vrishabh Chadchan"
            />
            <p className="mt-1 text-xs text-slate-500">The recipient name shown in payment confirmation screens (Google Pay, PhonePe, etc.). Used to verify that students paid this shop, not someone else.</p>
          </div>
          <div><Label>Avg time per 10 pages (min)</Label><Input type="number" min={1} value={avgTime} onChange={(event) => setAvgTime(Number(event.target.value))} /></div>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} />
          Shop open
        </label>
        <Button onClick={() => void saveSettings()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        {saveMessage && <p className={`text-sm font-medium ${saveMessage.startsWith('Error') ? 'text-rose-600' : 'text-emerald-700'}`}>{saveMessage}</p>}
      </Card>

      {/* QR code management */}
      <Card className="space-y-5">
        <div>
          <h2 className="font-[var(--font-space-grotesk)] text-2xl font-semibold text-slate-950">Payment QR code</h2>
          <p className="mt-2 text-sm text-slate-600">
            Upload your UPI payment QR code. Students will scan this to pay before placing an order.
          </p>
        </div>

        {currentQrUrl ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current QR code</p>
            <div className="inline-block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <img
                src={currentQrUrl}
                alt="Payment QR code"
                className="h-48 w-48 object-contain"
              />
            </div>
            <div>
              <Button
                variant="secondary"
                onClick={() => void handleQrDelete()}
                disabled={qrDeleting}
                className="text-rose-600 ring-rose-200 hover:bg-rose-50"
              >
                {qrDeleting ? 'Removing…' : 'Remove QR code'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No QR code uploaded yet. Students will see the UPI ID instead.
          </div>
        )}

        <div className="space-y-3">
          <Label htmlFor="qrUpload">Upload new QR code</Label>
          <input
            ref={qrInputRef}
            id="qrUpload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleQrFileChange}
            className="block text-sm text-slate-700"
          />
          {qrPreview && (
            <div className="inline-block rounded-2xl border border-brand-200 bg-brand-50 p-3">
              <img src={qrPreview} alt="Preview" className="h-40 w-40 object-contain" />
              <p className="mt-2 text-xs text-slate-500">Preview</p>
            </div>
          )}
          <div>
            <Button onClick={() => void handleQrUpload()} disabled={!qrFile || qrUploading || !shopId}>
              {qrUploading ? 'Uploading…' : 'Upload QR code'}
            </Button>
          </div>
        </div>

        {qrMessage && (
          <p className={`text-sm font-medium ${qrMessage.includes('failed') || qrMessage.startsWith('Error') ? 'text-rose-600' : 'text-emerald-700'}`}>
            {qrMessage}
          </p>
        )}
      </Card>
    </div>
  );
}
