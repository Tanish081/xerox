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
import { generateToken } from '@/lib/token';
import type { PriorityClass, PrintSettings } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

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

function encodeStoragePath(path: string) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function uploadWithProgress(bucket: string, path: string, file: File, onProgress: (percent: number) => void): Promise<{ error: Error | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return { error: new Error('Supabase environment variables are missing.') };
  }

  const { supabaseBrowser } = await import('@/lib/supabase');
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();

  const token = session?.access_token ?? anonKey;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ error: null });
        return;
      }

      resolve({ error: new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`) });
    };

    xhr.onerror = () => resolve({ error: new Error('Network error during upload') });

    const objectPath = encodeStoragePath(path);
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('x-upsert', 'true');
    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type);
    }

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

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [filePageCount, setFilePageCount] = useState(10);
  const [settings, setSettings] = useState<PrintSettings>(initialSettings);
  const [priorityClass, setPriorityClass] = useState<PriorityClass>('B');
  const [scheduledAfter, setScheduledAfter] = useState('');

  const [amount, setAmount] = useState(0);
  const [orderId, setOrderId] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [confirmation, setConfirmation] = useState<{ token: string; eta: string } | null>(null);

  const [documentUploadProgress, setDocumentUploadProgress] = useState(0);
  const [paymentUploadProgress, setPaymentUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [draggingDocument, setDraggingDocument] = useState(false);
  const [draggingPayment, setDraggingPayment] = useState(false);

  const estimatedAmount = useMemo(() => calculatePrice(settings, filePageCount), [settings, filePageCount]);

  useEffect(() => {
    const session = getStudentSession();
    if (!session?.studentId) {
      router.replace('/student/identify');
      return;
    }

    setStudentId(session.studentId);
    setShopId(session.shopId);
    setShopName(session.shopName);
    setShopUpiId(session.shopUpiId);
  }, [router]);

  async function createDraftOrder() {
    if (!file) {
      throw new Error('Document file is required.');
    }

    const { supabaseBrowser } = await import('@/lib/supabase');
    const { data, error } = await supabaseBrowser
      .from('orders')
      .insert({
        student_id: studentId,
        shop_id: shopId,
        status: 'pending_payment',
        priority_class: priorityClass,
        scheduled_after: priorityClass === 'C' && scheduledAfter ? new Date(scheduledAfter).toISOString() : null,
        print_settings: settings,
        estimated_amount: estimatedAmount,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    const documentPath = `${shopId}/${data.id}/${file.name}`;
    const { error: fileUploadError } = await uploadWithProgress('print-files', documentPath, file, setDocumentUploadProgress);
    if (fileUploadError) {
      throw fileUploadError;
    }

    const { supabaseBrowser: sb } = await import('@/lib/supabase');
    const { error: metadataError } = await sb
      .from('orders')
      .update({
        file_url: documentPath,
        file_name: file.name,
        file_page_count: filePageCount,
      })
      .eq('id', data.id);

    if (metadataError) {
      throw metadataError;
    }

    setOrderId(data.id);
    return data.id as string;
  }

  async function handleSubmitPayment() {
    setSubmitError('');
    setSubmitting(true);

    try {
      const { supabaseBrowser: sb } = await import('@/lib/supabase');
      const draftOrderId = orderId || (await createDraftOrder());
      const paymentPath = `${shopId}/${draftOrderId}/payment.jpg`;

      if (paymentScreenshot) {
        const { error: uploadError } = await uploadWithProgress('payment-screenshots', paymentPath, paymentScreenshot, setPaymentUploadProgress);
        if (uploadError) {
          throw uploadError;
        }
      }

      const token = await generateToken(shopId, priorityClass, sb as never);

      let eta: Date | null = null;
      try {
        eta = await calculateEstimatedReadyTime(draftOrderId, shopId, sb as never);
      } catch {
        eta = null;
      }

      const { error: updateError } = await sb
        .from('orders')
        .update({
          status: 'pending_approval',
          payment_screenshot_url: paymentPath,
          utr_number: utrNumber || null,
          token,
          estimated_ready_time: eta ? eta.toISOString() : null,
        })
        .eq('id', draftOrderId);

      if (updateError) {
        throw updateError;
      }

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
            <div className="font-[var(--font-space-grotesk)] text-7xl font-bold tracking-tight text-brand-700">{confirmation.token}</div>
          </div>
          <p className="text-sm text-slate-600">Estimated ready at {confirmation.eta}</p>
          <Button className="w-full rounded-xl" onClick={() => router.push('/student/dashboard')}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{shopName || 'Selected center'}</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">New print order</h2>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Step {step} of 4</div>
            <div>Upload, configure, pay, submit</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={`h-2 rounded-full ${index < step ? 'bg-brand-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </Card>

      {step === 1 ? (
        <Card className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Upload your document</h3>
            <p className="text-sm text-slate-600">PDF, DOC, DOCX, JPG, PNG up to 20MB.</p>
          </div>

          <label
            className={`block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition ${draggingDocument ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40'}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDraggingDocument(true);
            }}
            onDragLeave={() => setDraggingDocument(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingDocument(false);
              setFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
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
              <Label htmlFor="pages">Page count estimate</Label>
              <Input id="pages" type="number" min={1} value={filePageCount} onChange={(event) => setFilePageCount(Number(event.target.value))} />
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

          <Button className="w-full rounded-xl" onClick={() => setStep(2)} disabled={!file}>
            Continue
          </Button>
        </Card>
      ) : null}

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
                <ToggleChip active={settings.color === 'bw'} label="B&W" onClick={() => setSettings((current) => ({ ...current, color: 'bw' }))} />
                <ToggleChip active={settings.color === 'color'} label="Color" onClick={() => setSettings((current) => ({ ...current, color: 'color' }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Paper size</Label>
              <div className="flex gap-2">
                <ToggleChip active={settings.size === 'A4'} label="A4" onClick={() => setSettings((current) => ({ ...current, size: 'A4' }))} />
                <ToggleChip active={settings.size === 'A3'} label="A3" onClick={() => setSettings((current) => ({ ...current, size: 'A3' }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Printing side</Label>
              <div className="flex gap-2">
                <ToggleChip active={settings.side === 'single'} label="Single" onClick={() => setSettings((current) => ({ ...current, side: 'single' }))} />
                <ToggleChip active={settings.side === 'double'} label="Double" onClick={() => setSettings((current) => ({ ...current, side: 'double' }))} />
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
            <Button variant="secondary" className="rounded-xl" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button className="rounded-xl" onClick={() => setStep(3)}>
              Review summary
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Order summary</h3>
            <p className="text-sm text-slate-600">Check the cost before you pay.</p>
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between text-sm text-slate-700"><span>Copies</span><span>{settings.copies}</span></div>
            <div className="flex items-center justify-between text-sm text-slate-700"><span>Color</span><span>{settings.color === 'bw' ? 'B&W' : 'Color'}</span></div>
            <div className="flex items-center justify-between text-sm text-slate-700"><span>Paper size</span><span>{settings.size}</span></div>
            <div className="flex items-center justify-between text-sm text-slate-700"><span>Printing side</span><span>{settings.side === 'single' ? 'Single' : 'Double'}</span></div>
            <div className="flex items-center justify-between text-sm text-slate-700"><span>Priority</span><span>{priorityClass}</span></div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-brand-700"><span>Total</span><span>₹{estimatedAmount.toFixed(2)}</span></div>
          </div>

          <div className="space-y-3 rounded-xl bg-slate-950 p-5 text-white">
            <div className="text-sm text-slate-300">Pay to UPI</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-2xl font-semibold">{shopUpiId || 'Loading UPI ID...'}</div>
              <CopyChip value={shopUpiId || 'Loading'} label="Copy UPI" className="bg-white/10 text-white ring-white/15 hover:bg-white/20 hover:text-white" />
            </div>
            <div className="text-lg font-semibold">₹{estimatedAmount.toFixed(2)}</div>
            <a className="inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950" href={`upi://pay?pa=${shopUpiId}&am=${estimatedAmount.toFixed(2)}&tn=PrintQ%20Order`}>
              Open UPI App
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button className="rounded-xl" onClick={() => setStep(4)}>
              Upload payment
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Payment proof</h3>
            <p className="text-sm text-slate-600">Add your screenshot and UTR, then submit.</p>
          </div>

          <label
            className={`block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition ${draggingPayment ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40'}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDraggingPayment(true);
            }}
            onDragLeave={() => setDraggingPayment(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingPayment(false);
              setPaymentScreenshot(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input type="file" accept="image/*" className="hidden" onChange={(event) => setPaymentScreenshot(event.target.files?.[0] ?? null)} />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Tap to upload screenshot</p>
              <p className="text-xs text-slate-500">PNG or JPG recommended</p>
            </div>
            {paymentScreenshot ? (
              <div className="mt-4 rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm ring-1 ring-slate-200">
                <div className="font-semibold text-slate-900">{paymentScreenshot.name}</div>
                <div className="text-slate-500">{formatFileSize(paymentScreenshot.size)}</div>
              </div>
            ) : null}
          </label>

          <div>
            <Label htmlFor="utr">UTR number</Label>
            <Input id="utr" value={utrNumber} onChange={(event) => setUtrNumber(event.target.value)} placeholder="Enter the UTR/reference number" />
          </div>

          {documentUploadProgress > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Document upload: {documentUploadProgress}%</p>
              <Progress value={documentUploadProgress} />
            </div>
          ) : null}

          {paymentUploadProgress > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Payment screenshot upload: {paymentUploadProgress}%</p>
              <Progress value={paymentUploadProgress} />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" className="rounded-xl" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button className="rounded-xl" onClick={() => void handleSubmitPayment()} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit order'}
            </Button>
          </div>

          {submitError ? <p className="text-sm font-medium text-rose-600">{submitError}</p> : null}
        </Card>
      ) : null}

      <div className="text-xs text-slate-500">
        <StatusBadge status="pending_payment" className="mr-2 align-middle" />
        {shopName ? `Ordering for ${shopName}` : 'Select a center first'}
      </div>
    </div>
  );
}