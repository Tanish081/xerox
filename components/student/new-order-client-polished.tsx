"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { CopyChip } from '@/components/shared/copy-chip';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { Progress } from '@/components/shared/progress';
import { StatusBadge } from '@/components/shared/status-badge';
import { calculatePrice } from '@/lib/pricing';
import { calculateEstimatedReadyTime } from '@/lib/queue';
import { getStudentSession } from '@/lib/student-session';
import { ensureStudentFlowReady } from '@/lib/student-route-guard';
import { displayToken } from '@/lib/token';
import { detectPageCount } from '@/lib/detect-page-count';
import { extractPaymentTime, extractRecipient, extractAmount } from '@/lib/payment-ocr';
import type { PriorityClass, PrintSettings } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

const PAYMENT_WINDOW_SECONDS = 600; // 10 minutes

const initialSettings: PrintSettings = {
  copies: 1,
  pages: 'all',
  color: 'bw',
  size: 'A4',
  side: 'single',
  staple: false,
  notes: '',
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ error: Error | null }> {
  const { supabaseBrowser } = await import('@/lib/supabase');
  const { data: refreshData } = await supabaseBrowser.auth.refreshSession();
  const accessToken =
    refreshData.session?.access_token ??
    (await supabaseBrowser.auth.getSession()).data.session?.access_token;

  if (!accessToken) return { error: new Error('Your session has expired. Please sign in again.') };

  const urlRes = await fetch('/api/student/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ bucket, path }),
  });

  const urlPayload = (await urlRes.json()) as { signedUrl?: string; token?: string; error?: string };
  if (!urlRes.ok || !urlPayload.signedUrl) {
    return { error: new Error(urlPayload.error ?? 'Could not obtain upload URL.') };
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ error: null });
        return;
      }
      let detail = `${xhr.status} ${xhr.statusText}`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        detail = body.message ?? body.error ?? detail;
      } catch {
        if (xhr.responseText) detail = xhr.responseText.slice(0, 200);
      }
      resolve({ error: new Error(`Upload failed: ${detail}`) });
    };

    xhr.onerror = () => resolve({ error: new Error('Network error during upload') });
    xhr.open('PUT', urlPayload.signedUrl!);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-700'}`}
    >
      {label}
    </button>
  );
}

export function NewOrderClientPolished() {
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [shopId, setShopId] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopUpiId, setShopUpiId] = useState('');
  const [shopQrUrl, setShopQrUrl] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [filePageCount, setFilePageCount] = useState(1);
  const [pageCountAutoDetected, setPageCountAutoDetected] = useState(false);
  const [detectingPages, setDetectingPages] = useState(false);
  const [settings, setSettings] = useState<PrintSettings>(initialSettings);
  const [priorityClass, setPriorityClass] = useState<PriorityClass>('B');
  const [scheduledAfter, setScheduledAfter] = useState('');

  const [orderId, setOrderId] = useState('');
  const [confirmation, setConfirmation] = useState<{ token: string; eta: string } | null>(null);

  // Stationery add-ons
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [addonCart, setAddonCart] = useState<Record<string, number>>({});

  // Payment / verification state
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [paymentScreenshotPreview, setPaymentScreenshotPreview] = useState<string | null>(null);
  const [storedPaymentPath, setStoredPaymentPath] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Client-side OCR state
  type OcrStatus = 'idle' | 'scanning' | 'found' | 'not_found';
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle');
  const [extractedPaymentTime, setExtractedPaymentTime] = useState<Date | null>(null);
  const [extractedTimeLabel, setExtractedTimeLabel] = useState('');
  const [extractedRecipientValue, setExtractedRecipientValue] = useState<string | null>(null);
  const [extractedAmountValue, setExtractedAmountValue] = useState<number | null>(null);

  // Countdown (seconds remaining in 10-min upload window)
  const [countdown, setCountdown] = useState(PAYMENT_WINDOW_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [documentUploadProgress, setDocumentUploadProgress] = useState(0);
  const [paymentUploadProgress, setPaymentUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [draggingDocument, setDraggingDocument] = useState(false);
  const [setupWarning, setSetupWarning] = useState('');

  const estimatedAmount = useMemo(() => calculatePrice(settings, filePageCount), [settings, filePageCount]);
  const addonTotal = useMemo(() => {
    return Object.entries(addonCart).reduce((sum, [id, qty]) => {
      const item = storeItems.find((i: any) => i.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }, [addonCart, storeItems]);
  const grandTotal = estimatedAmount + addonTotal;

  const fetchStoreItems = async (sid: string) => {
    setStoreLoading(true);
    const { supabaseBrowser } = await import('@/lib/supabase');
    const { data } = await supabaseBrowser
      .from('stationary_items')
      .select('*')
      .eq('shop_id', sid)
      .eq('is_available', true)
      .gt('stock_quantity', 0);
    setStoreItems(data ?? []);
    setStoreLoading(false);
  };

  const loadShopQr = async (sid: string) => {
    const { supabaseBrowser } = await import('@/lib/supabase');
    const { data } = await supabaseBrowser
      .from('shops')
      .select('payment_qr_url')
      .eq('id', sid)
      .single();
    setShopQrUrl((data as any)?.payment_qr_url ?? null);
  };

  const updateAddonCart = (id: string, delta: number) => {
    setAddonCart((prev) => {
      const current = prev[id] ?? 0;
      const next = current + delta;
      const item = storeItems.find((i: any) => i.id === id);
      if (!item || next < 0 || next > item.stock_quantity) return prev;
      const newCart = { ...prev };
      if (next === 0) delete newCart[id];
      else newCart[id] = next;
      return newCart;
    });
  };

  useEffect(() => {
    async function checkSetup() {
      const response = await fetch('/api/health', { method: 'POST' });
      const payload = (await response.json()) as { ok?: boolean; missing?: string[] };
      if (!response.ok || !payload.ok) {
        const missing = payload.missing?.length ? payload.missing.join(', ') : 'required Supabase setup';
        setSetupWarning(`System setup incomplete: ${missing}. Store add-ons may be unavailable until fixed.`);
      }
    }

    void (async () => {
      const ok = await ensureStudentFlowReady(router);
      if (!ok) return;
      const session = getStudentSession();
      if (!session?.studentId) return;
      setStudentId(session.studentId);
      setShopId(session.shopId);
      setShopName(session.shopName);
      setShopUpiId(session.shopUpiId);
      void fetchStoreItems(session.shopId);
      void checkSetup();
    })();
  }, [router]);

  // Start countdown when user enters step 4
  useEffect(() => {
    if (step === 4) {
      setCountdown(PAYMENT_WINDOW_SECONDS);
      void loadShopQr(shopId);

      const id = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      countdownRef.current = id;
      return () => clearInterval(id);
    }
    // Reset when leaving payment step
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [step, shopId]);

  async function handleFileSelect(selected: File | null) {
    setFile(selected);
    setPageCountAutoDetected(false);
    if (!selected) return;
    setDetectingPages(true);
    try {
      const count = await detectPageCount(selected);
      if (count !== null) {
        setFilePageCount(count);
        setPageCountAutoDetected(true);
      }
    } finally {
      setDetectingPages(false);
    }
  }

  function handleScreenshotSelect(selected: File | null) {
    setPaymentScreenshot(selected);
    setPaymentVerified(false);
    setVerifyError('');
    setOcrStatus('idle');
    setExtractedPaymentTime(null);
    setExtractedTimeLabel('');
    setExtractedRecipientValue(null);
    setExtractedAmountValue(null);
    if (paymentScreenshotPreview) URL.revokeObjectURL(paymentScreenshotPreview);
    setPaymentScreenshotPreview(selected ? URL.createObjectURL(selected) : null);

    // Start OCR immediately in the background so it's ready when user clicks Verify
    if (selected) void runOcr(selected);
  }

  async function runOcr(imageFile: File) {
    setOcrStatus('scanning');
    try {
      const { createWorker } = await import('tesseract.js');
      // OEM 1 = LSTM_ONLY (faster), no legacy engine overhead
      const worker = await createWorker('eng', 1);
      // PSM 11 = SPARSE_TEXT — best for receipt-style layouts
      await worker.setParameters({ tessedit_pageseg_mode: '11' as any });
      const { data: { text } } = await worker.recognize(imageFile);
      await worker.terminate();

      const t = extractPaymentTime(text);
      const recipient = extractRecipient(text);
      const amount = extractAmount(text);

      setExtractedPaymentTime(t);
      setExtractedRecipientValue(recipient);
      setExtractedAmountValue(amount);

      if (t) {
        setExtractedTimeLabel(
          t.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        );
        setOcrStatus('found');
      } else {
        setOcrStatus('not_found');
      }
    } catch (err) {
      console.error('Client OCR error:', err);
      setOcrStatus('not_found');
    }
  }

  async function createDraftOrder() {
    if (!file) throw new Error('Document file is required.');

    const response = await fetch('/api/student/orders/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        shop_id: shopId,
        priority_class: priorityClass,
        scheduled_after: priorityClass === 'C' && scheduledAfter ? new Date(scheduledAfter).toISOString() : null,
        print_settings: settings,
        estimated_amount: estimatedAmount,
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    const data = payload.data;

    const documentPath = `${shopId}/${data.id}/${file.name}`;
    const { error: fileUploadError } = await uploadWithProgress('print-files', documentPath, file, setDocumentUploadProgress);
    if (fileUploadError) throw fileUploadError;

    const updateResponse = await fetch('/api/student/orders/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: data.id,
        updates: { file_url: documentPath, file_name: file.name, file_page_count: filePageCount },
      }),
    });
    if (!updateResponse.ok) throw new Error('Failed to update order metadata');

    setOrderId(data.id);
    return data.id as string;
  }

  async function handleVerifyPayment() {
    if (!paymentScreenshot) return;
    setVerifyError('');
    setVerifying(true);

    try {
      // Wait for OCR to finish if it's still running
      if (ocrStatus === 'scanning') {
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            setOcrStatus((s) => {
              if (s !== 'scanning') { clearInterval(check); resolve(); }
              return s;
            });
          }, 300);
        });
      }

      // Create draft order (uploads document) if not done yet
      const draftOrderId = orderId || (await createDraftOrder());

      // Upload screenshot to storage for operator review
      const screenshotExt = paymentScreenshot.name.split('.').at(-1) ?? 'jpg';
      const screenshotPath = `${shopId}/${draftOrderId}/payment.${screenshotExt}`;
      setPaymentUploadProgress(0);
      const { error: screenshotUploadError } = await uploadWithProgress(
        'payment-screenshots',
        screenshotPath,
        paymentScreenshot,
        setPaymentUploadProgress,
      );
      if (screenshotUploadError) throw screenshotUploadError;
      setStoredPaymentPath(screenshotPath);

      // Server does the time-window check and saves the screenshot URL
      const res = await fetch('/api/student/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: draftOrderId,
          student_id: studentId,
          utr_number: utrNumber.trim() || null,
          screenshot_path: screenshotPath,
          payment_time_iso: extractedPaymentTime?.toISOString() ?? null,
          extracted_recipient: extractedRecipientValue,
          extracted_amount: extractedAmountValue,
        }),
      });
      const result = (await res.json()) as { verified?: boolean; reason?: string; error?: string };

      if (!res.ok || !result.verified) {
        setVerifyError(result.reason ?? result.error ?? 'Verification failed.');
        return;
      }

      setPaymentVerified(true);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmitOrder() {
    if (!paymentVerified || !orderId) return;
    setSubmitError('');
    setSubmitting(true);

    try {
      const { supabaseBrowser: sb } = await import('@/lib/supabase');

      let eta: Date | null = null;
      try {
        eta = await calculateEstimatedReadyTime(orderId, shopId, sb as never);
      } catch {
        eta = null;
      }

      const stationaryCart = Object.entries(addonCart).flatMap(([id, qty]) => {
        const item = storeItems.find((entry: any) => entry.id === id);
        return item ? [{ id, name: item.name, qty, unit_price: item.price }] : [];
      });

      const submitRes = await fetch('/api/student/orders/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          shopId,
          studentId,
          paymentPath: storedPaymentPath,
          utrNumber: utrNumber.trim(),
          estimatedReadyTime: eta?.toISOString() ?? null,
          printAmount: estimatedAmount,
          stationaryCart,
        }),
      });

      const submitPayload = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitPayload.error || 'Failed to submit order');

      const token: string = submitPayload.token ?? '';
      setConfirmation({ token, eta: eta ? eta.toLocaleString('en-IN') : 'Will be updated soon' });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
        <Card className="w-full max-w-md space-y-6 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-600">✓</div>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Order placed</h2>
            <p className="text-sm text-slate-600">Show this token at the counter.</p>
          </div>
          <div className="rounded-3xl bg-brand-50 p-6 ring-1 ring-brand-100">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-700">Token</div>
            <div className="font-[var(--font-space-grotesk)] text-7xl font-bold tracking-tight text-brand-700">{displayToken(confirmation.token)}</div>
          </div>
          <p className="text-sm text-slate-600">Estimated ready at {confirmation.eta}</p>
          <Button className="w-full rounded-xl" onClick={() => router.push('/student/dashboard')}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const countdownMinutes = Math.floor(countdown / 60);
  const countdownSeconds = countdown % 60;

  return (
    <div className="space-y-6 pb-6">
      {setupWarning ? (
        <Card className="border border-amber-300 bg-amber-50 text-amber-900">
          <p className="text-sm font-medium">{setupWarning}</p>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{shopName || 'Selected center'}</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">New print order</h2>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Step {step} of 4</div>
            <div>Upload, configure, add-ons, pay</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={`h-2 rounded-full ${index < step ? 'bg-brand-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </Card>

      {/* ── Step 1: Upload document ── */}
      {step === 1 ? (
        <Card className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Upload your document</h3>
            <p className="text-sm text-slate-600">PDF, DOC, DOCX, JPG, PNG up to 20MB.</p>
          </div>

          <label
            className={`block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition ${draggingDocument ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40'}`}
            onDragOver={(event) => { event.preventDefault(); setDraggingDocument(true); }}
            onDragLeave={() => setDraggingDocument(false)}
            onDrop={(event) => { event.preventDefault(); setDraggingDocument(false); void handleFileSelect(event.dataTransfer.files?.[0] ?? null); }}
          >
            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(event) => void handleFileSelect(event.target.files?.[0] ?? null)} />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Tap to browse or drag & drop</p>
              <p className="text-xs text-slate-500">Drop your file into the dashed zone</p>
            </div>
            {file ? (
              <div className="mt-4 rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm ring-1 ring-slate-200">
                <div className="font-semibold text-slate-900">{file.name}</div>
                <div className="text-slate-500">{formatFileSize(file.size)}</div>
              </div>
            ) : null}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="pages">Number of pages</Label>
                {detectingPages && <span className="text-xs text-slate-500 animate-pulse">Detecting…</span>}
                {!detectingPages && pageCountAutoDetected && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Auto-detected</span>
                )}
              </div>
              <Input
                id="pages"
                type="number"
                min={1}
                value={filePageCount}
                onChange={(event) => { setFilePageCount(Number(event.target.value)); setPageCountAutoDetected(false); }}
              />
              <p className="mt-1 text-xs text-slate-500">Edit if you only want to print specific pages.</p>
            </div>
            <div>
              <Label htmlFor="copies">Copies</Label>
              <Input id="copies" type="number" min={1} value={settings.copies} onChange={(event) => setSettings((current) => ({ ...current, copies: Number(event.target.value) }))} />
            </div>
          </div>

          {documentUploadProgress > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Document upload: {documentUploadProgress}%</p>
              <Progress value={documentUploadProgress} />
            </div>
          ) : null}

          <Button className="w-full rounded-xl" onClick={() => setStep(2)} disabled={!file}>Continue</Button>
        </Card>
      ) : null}

      {/* ── Step 2: Print settings ── */}
      {step === 2 ? (
        <Card className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Print settings</h3>
            <p className="text-sm text-slate-600">Pick the right finish for this job.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Color mode</Label>
              <div className="flex gap-2">
                <ToggleChip active={settings.color === 'bw'} label="B&W" onClick={() => setSettings((c) => ({ ...c, color: 'bw' }))} />
                <ToggleChip active={settings.color === 'color'} label="Color" onClick={() => setSettings((c) => ({ ...c, color: 'color' }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Paper size</Label>
              <div className="flex gap-2">
                <ToggleChip active={settings.size === 'A4'} label="A4" onClick={() => setSettings((c) => ({ ...c, size: 'A4' }))} />
                <ToggleChip active={settings.size === 'A3'} label="A3" onClick={() => setSettings((c) => ({ ...c, size: 'A3' }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Printing side</Label>
              <div className="flex gap-2">
                <ToggleChip active={settings.side === 'single'} label="Single" onClick={() => setSettings((c) => ({ ...c, side: 'single' }))} />
                <ToggleChip active={settings.side === 'double'} label="Double" onClick={() => setSettings((c) => ({ ...c, side: 'double' }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="flex flex-wrap gap-2">
                <ToggleChip active={priorityClass === 'A'} label="A - Urgent" onClick={() => setPriorityClass('A')} />
                <ToggleChip active={priorityClass === 'B'} label="B - Normal" onClick={() => setPriorityClass('B')} />
                <ToggleChip active={priorityClass === 'C'} label="C - Scheduled" onClick={() => setPriorityClass('C')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduledAfter">Scheduled after</Label>
              <Input id="scheduledAfter" type="datetime-local" value={scheduledAfter} onChange={(event) => setScheduledAfter(event.target.value)} disabled={priorityClass !== 'C'} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => setStep(1)}>Back</Button>
            <Button className="rounded-xl" onClick={() => setStep(3)}>Add-ons & Continue</Button>
          </div>
        </Card>
      ) : null}

      {/* ── Step 3: Stationery add-ons ── */}
      {step === 3 ? (
        <Card className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Add Stationery Items</h3>
            <p className="text-sm text-slate-600">Optionally add pens, paper, or other items to your order.</p>
          </div>
          {storeLoading ? (
            <p className="text-sm text-slate-500">Loading items…</p>
          ) : storeItems.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-500">No stationery items are available at this shop right now.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {storeItems.map((item: any) => {
                const qty = addonCart[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    {item.image_url && <img src={item.image_url} alt={item.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />}
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{item.name}</p>
                        <p className="text-xs text-emerald-700 font-bold">₹{item.price}</p>
                        <p className="text-[10px] font-medium text-emerald-600 mt-0.5">In Stock</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {qty === 0 ? (
                          <button onClick={() => updateAddonCart(item.id, 1)} className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">+ Add</button>
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg bg-brand-50 ring-1 ring-brand-200">
                            <button onClick={() => updateAddonCart(item.id, -1)} className="w-7 h-7 flex items-center justify-center text-brand-700 font-bold hover:bg-brand-100 rounded-l-lg">−</button>
                            <span className="text-xs font-bold text-brand-900 w-4 text-center">{qty}</span>
                            <button onClick={() => updateAddonCart(item.id, 1)} disabled={qty >= item.stock_quantity} className="w-7 h-7 flex items-center justify-center text-brand-700 font-bold hover:bg-brand-100 rounded-r-lg disabled:opacity-40">+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {addonTotal > 0 && (
            <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">
              Add-ons subtotal: ₹{addonTotal.toFixed(2)}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => setStep(2)}>Back</Button>
            <Button className="rounded-xl" onClick={() => setStep(4)}>Review & Pay</Button>
          </div>
        </Card>
      ) : null}

      {/* ── Step 4: Payment ── */}
      {step === 4 ? (
        <Card className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Payment</h3>
            <p className="text-sm text-slate-600">Scan the QR code, pay, then verify your transaction to place the order.</p>
          </div>

          {/* Order total summary */}
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex justify-between text-sm text-slate-700"><span>Print subtotal</span><span>₹{estimatedAmount.toFixed(2)}</span></div>
            {addonTotal > 0 && <div className="flex justify-between text-sm text-slate-700"><span>Stationery add-ons</span><span>₹{addonTotal.toFixed(2)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-brand-700"><span>Total to pay</span><span>₹{grandTotal.toFixed(2)}</span></div>
          </div>

          {/* QR code + UPI block */}
          <div className="rounded-xl bg-slate-950 p-5 text-white space-y-4">
            <p className="text-sm font-semibold text-slate-300">Scan to pay ₹{grandTotal.toFixed(2)}</p>

            {shopQrUrl ? (
              <div className="inline-block rounded-xl bg-white p-3 shadow">
                <img
                  src={shopQrUrl}
                  alt="Payment QR Code"
                  className="h-52 w-52 object-contain"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800/50 p-6 text-center text-sm text-slate-400">
                No QR code uploaded by the shopkeeper yet. Use the UPI ID below.
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-slate-400">UPI ID</div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl font-semibold">{shopUpiId || 'Loading…'}</span>
                {shopUpiId && <CopyChip value={shopUpiId} label="Copy" className="bg-white/10 text-white ring-white/15 hover:bg-white/20 hover:text-white" />}
              </div>
            </div>

            {shopUpiId && (
              <a
                href={`upi://pay?pa=${shopUpiId}&am=${grandTotal.toFixed(2)}&tn=PrintQ%20Order`}
                className="inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950"
              >
                Open UPI App
              </a>
            )}
          </div>

          {/* 10-minute countdown */}
          <div className={`rounded-xl p-4 text-sm font-medium ${countdown > 0 ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
            {countdown > 0 ? (
              <>
                Upload your screenshot within{' '}
                <span className="font-bold tabular-nums">{countdownMinutes}:{countdownSeconds.toString().padStart(2, '0')}</span>{' '}
                of making the payment.
              </>
            ) : (
              'Time window expired. Please make a fresh payment and start over.'
            )}
          </div>

          {/* Verification section */}
          {!paymentVerified ? (
            <div className="space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-sm font-semibold text-slate-800">Verify your payment</p>

              {/* Screenshot upload — OCR starts automatically */}
              <div>
                <Label htmlFor="screenshotInput">Payment screenshot</Label>
                <input
                  id="screenshotInput"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleScreenshotSelect(e.target.files?.[0] ?? null)}
                  className="mt-1 block text-sm text-slate-700"
                />

                {/* OCR status indicator */}
                {ocrStatus === 'scanning' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                    Reading payment details from screenshot…
                  </div>
                )}
                {ocrStatus === 'found' && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <span>✓</span> Payment time detected: {extractedTimeLabel}
                  </div>
                )}
                {ocrStatus === 'not_found' && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                    Could not read date/time from screenshot. Verification will still proceed — the shopkeeper will review manually.
                  </div>
                )}

                {paymentScreenshotPreview && (
                  <div className="mt-3">
                    <img
                      src={paymentScreenshotPreview}
                      alt="Screenshot preview"
                      className="max-h-48 rounded-xl border border-slate-200 object-contain shadow-sm"
                    />
                  </div>
                )}
              </div>

              {/* UTR — recorded for shopkeeper, not used as verification gate */}
              <div>
                <Label htmlFor="utrInput">Transaction ID / UTR <span className="font-normal text-slate-400">(optional, for record)</span></Label>
                <Input
                  id="utrInput"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="Reference number shown in your payment app"
                  className="mt-1"
                />
              </div>

              {paymentUploadProgress > 0 && paymentUploadProgress < 100 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-600">Uploading screenshot… {paymentUploadProgress}%</p>
                  <Progress value={paymentUploadProgress} />
                </div>
              )}

              {verifyError && (
                <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
                  {verifyError}
                </div>
              )}

              <Button
                className="w-full rounded-xl"
                onClick={() => void handleVerifyPayment()}
                disabled={verifying || !paymentScreenshot || countdown === 0}
              >
                {verifying ? 'Verifying…' : ocrStatus === 'scanning' ? 'Scanning screenshot…' : 'Verify Payment'}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 flex items-center gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <p className="font-semibold text-emerald-800">Payment verified</p>
                <p className="text-sm text-emerald-700">Transaction ID matched. You can now submit your order.</p>
              </div>
            </div>
          )}

          {submitError && <p className="text-sm font-medium text-rose-600">{submitError}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => setStep(3)} disabled={submitting}>
              Back
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => void handleSubmitOrder()}
              disabled={submitting || !paymentVerified}
            >
              {submitting ? 'Submitting order…' : 'Submit Order'}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="text-xs text-slate-500">
        <StatusBadge status="pending_payment" className="mr-2 align-middle" />
        {shopName ? `Ordering for ${shopName}` : 'Select a center first'}
      </div>
    </div>
  );
}
