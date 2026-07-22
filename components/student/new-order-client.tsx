"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { Progress } from '@/components/shared/progress';
import { calculatePrice } from '@/lib/pricing';
import { calculateEstimatedReadyTime } from '@/lib/queue';
import { getStudentSession } from '@/lib/student-session';
import { supabaseBrowser } from '@/lib/supabase';
import { generateToken } from '@/lib/token';
import type { PriorityClass, PrintSettings } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
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

function encodeStoragePath(path: string) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ error: Error | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return { error: new Error('Supabase environment variables are missing.') };
  }

  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();

  const token = session?.access_token ?? anonKey;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ error: null });
      } else {
        resolve({ error: new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`) });
      }
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

export function NewOrderClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [shopId, setShopId] = useState(searchParams.get('shop') ?? '');

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [filePageCount, setFilePageCount] = useState(10);
  const [settings, setSettings] = useState<PrintSettings>(initialSettings);
  const [priorityClass, setPriorityClass] = useState<PriorityClass>('B');
  const [scheduledAfter, setScheduledAfter] = useState('');

  const [upiId, setUpiId] = useState('');
  const [amount, setAmount] = useState(0);
  const [orderId, setOrderId] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [confirmation, setConfirmation] = useState<{ token: string; eta: string } | null>(null);

  const [documentUploadProgress, setDocumentUploadProgress] = useState(0);
  const [paymentUploadProgress, setPaymentUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const estimatedAmount = useMemo(() => calculatePrice(settings, filePageCount), [settings, filePageCount]);

  useEffect(() => {
    const session = getStudentSession();
    if (!session?.studentId) {
      setSubmitError('Student session missing. Please start from /student?shop=SHOP_ID');
      return;
    }

    setStudentId(session.studentId);
    setShopId((current) => current || session.shopId);
  }, []);

  async function createDraftOrder() {
    if (!file) {
      throw new Error('Document file is required.');
    }

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

    const dateFolder = new Date().toISOString().slice(0, 10);
    const documentPath = `${shopId}/${data.id}/${file.name}`;
    const { error: fileUploadError } = await uploadWithProgress('print-files', documentPath, file, setDocumentUploadProgress);
    if (fileUploadError) {
      throw fileUploadError;
    }

    const { error: metadataError } = await supabaseBrowser
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
      const draftOrderId = orderId || (await createDraftOrder());
      const paymentPath = `${shopId}/${draftOrderId}/payment.jpg`;

      if (paymentScreenshot) {
        const { error: uploadError } = await uploadWithProgress('payment-screenshots', paymentPath, paymentScreenshot, setPaymentUploadProgress);
        if (uploadError) {
          throw uploadError;
        }
      }

      const token = await generateToken(shopId, priorityClass, supabaseBrowser as never);

      let eta: Date | null = null;
      try {
        eta = await calculateEstimatedReadyTime(draftOrderId, shopId, supabaseBrowser as never);
      } catch {
        eta = null;
      }

      const { error: updateError } = await supabaseBrowser
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
      <Card className="space-y-5 text-center">
        <h2 className="font-[var(--font-space-grotesk)] text-3xl font-semibold text-slate-950">Your Token</h2>
        <div className="font-[var(--font-space-grotesk)] text-7xl font-bold tracking-tight text-brand-700">{confirmation.token}</div>
        <p className="text-sm font-medium text-slate-600">Show this at the counter</p>
        <p className="text-slate-600">Estimated ready at {confirmation.eta}</p>
        <Button onClick={() => router.push(`/student/dashboard?shop=${shopId}`)}>Back to dashboard</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">Step {step} of 4</h2>
          <span className="text-sm text-slate-500">Upload, configure, pay, submit</span>
        </div>
        <Progress value={(step / 4) * 100} />
      </Card>

      {step === 1 ? (
        <Card className="space-y-4">
          <div>
            <h3 className="section-title">Upload file</h3>
            <p className="text-sm text-slate-600">PDF, DOC, DOCX, JPG, PNG up to 50MB.</p>
          </div>
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <Label htmlFor="pages">Page count estimate</Label>
          <Input id="pages" type="number" min={1} value={filePageCount} onChange={(event) => setFilePageCount(Number(event.target.value))} />
          <Button onClick={() => setStep(2)} disabled={!file}>Continue</Button>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-4">
          <h3 className="section-title">Print settings</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Copies</Label><Input type="number" min={1} value={settings.copies} onChange={(event) => setSettings((current) => ({ ...current, copies: Number(event.target.value) }))} /></div>
            <div><Label>Pages</Label><Input value={settings.pages} onChange={(event) => setSettings((current) => ({ ...current, pages: event.target.value }))} /></div>
            <div>
              <Label>Priority</Label>
              <select className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" value={priorityClass} onChange={(event) => setPriorityClass(event.target.value as PriorityClass)}>
                <option value="A">A - Urgent</option>
                <option value="B">B - Normal</option>
                <option value="C">C - Scheduled</option>
              </select>
            </div>
            <div><Label>Scheduled after</Label><Input type="datetime-local" value={scheduledAfter} onChange={(event) => setScheduledAfter(event.target.value)} disabled={priorityClass !== 'C'} /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Review price</Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-4">
          <h3 className="section-title">Summary</h3>
          <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
            <p>Estimated amount: ₹{estimatedAmount.toFixed(2)}</p>
            <p>Operator UPI will be shown after payment details load.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={async () => {
              const shop = await supabaseBrowser.from('shops').select('upi_id').eq('id', shopId).single();
              setUpiId(shop.data?.upi_id ?? '');
              setAmount(estimatedAmount);
              setStep(4);
            }}>
              Proceed to payment
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="space-y-4">
          <h3 className="section-title">Payment</h3>
          <div className="rounded-3xl bg-slate-950 p-5 text-white">
            <div className="text-sm text-slate-300">Pay to</div>
            <div className="mt-1 text-2xl font-semibold">{upiId || 'Loading UPI ID...'}</div>
            <div className="mt-3 text-lg">₹{amount.toFixed(2)}</div>
            <a className="mt-4 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950" href={`upi://pay?pa=${upiId}&am=${amount.toFixed(2)}&tn=PrintQ%20Order`}>
              Open UPI App
            </a>
          </div>

          <div>
            <Label htmlFor="paymentScreenshot">Payment screenshot</Label>
            <input id="paymentScreenshot" type="file" accept="image/*" onChange={(event) => setPaymentScreenshot(event.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label htmlFor="utr">UTR number</Label>
            <Input id="utr" value={utrNumber} onChange={(event) => setUtrNumber(event.target.value)} />
          </div>

          {documentUploadProgress > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Document upload: {documentUploadProgress}%</p>
              <Progress value={documentUploadProgress} />
              {documentUploadProgress === 100 ? <p className="text-sm font-semibold text-emerald-700">Upload complete ✓</p> : null}
            </div>
          ) : null}

          {paymentUploadProgress > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Payment screenshot upload: {paymentUploadProgress}%</p>
              <Progress value={paymentUploadProgress} />
              {paymentUploadProgress === 100 ? <p className="text-sm font-semibold text-emerald-700">Upload complete ✓</p> : null}
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={() => void handleSubmitPayment()} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit order'}</Button>
          </div>

          {submitError ? <p className="text-sm font-medium text-rose-600">{submitError}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
