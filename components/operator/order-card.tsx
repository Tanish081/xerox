import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import type { Order } from '@/types';
import { useEffect, useMemo, useState } from 'react';

function isImageFile(path: string) {
  const lower = path.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
}

export function OperatorOrderCard({
  order,
  onApprove,
  onReject,
  onProcess,
  onComplete,
}: {
  order: Order;
  onApprove?: (id: string) => void;
  onReject?: (id: string, reason: string) => void;
  onProcess?: (id: string) => void;
  onComplete?: (id: string) => void;
}) {
  const [paymentUrl, setPaymentUrl] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [isRejectFormOpen, setIsRejectFormOpen] = useState(false);
  const [isRejectSubmitting, setIsRejectSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  useEffect(() => {
    async function loadSignedUrls() {
      const { supabaseBrowser } = await import('@/lib/supabase');
      if (order.payment_screenshot_url) {
        const { data } = await supabaseBrowser.storage.from('payment-screenshots').createSignedUrl(order.payment_screenshot_url, 3600);
        setPaymentUrl(data?.signedUrl ?? '');
      } else {
        setPaymentUrl('');
      }

      if (order.file_url) {
        const { data } = await supabaseBrowser.storage.from('print-files').createSignedUrl(order.file_url, 3600);
        setDocumentUrl(data?.signedUrl ?? '');
      } else {
        setDocumentUrl('');
      }
    }

    void loadSignedUrls();
  }, [order.file_url, order.payment_screenshot_url]);

  const canPreviewPayment = useMemo(() => Boolean(paymentUrl), [paymentUrl]);
  const canPreviewDocument = useMemo(() => Boolean(documentUrl), [documentUrl]);

  async function handleRejectSubmit() {
    if (!onReject) {
      return;
    }

    if (rejectReason.trim().length < 5) {
      setRejectError('Please add at least 5 characters.');
      return;
    }

    setRejectError('');
    setIsRejectSubmitting(true);
    await onReject(order.id, rejectReason.trim());
    setIsRejectSubmitting(false);
    setIsRejectFormOpen(false);
    setRejectReason('');
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-2xl bg-brand-50 px-4 py-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">Token</div>
          <div className="font-[var(--font-space-grotesk)] text-4xl font-bold text-brand-700">{order.token ?? '--'}</div>
        </div>
        <div className="flex-1">
          <h3 className="mt-3 text-lg font-semibold text-slate-950">Student order</h3>
          <p className="text-sm text-slate-600">{order.file_name ?? 'Document'}</p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>{order.priority_class} class</div>
          <div>{order.status.replaceAll('_', ' ')}</div>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="text-slate-700">Amount: ₹{order.estimated_amount ?? 0}</div>
        {order.utr_number ? <div className="text-slate-700">UTR: {order.utr_number}</div> : null}
      </div>

      {canPreviewPayment ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment screenshot</div>
          {isImageFile(order.payment_screenshot_url ?? '') ? (
            <a href={paymentUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-slate-200">
              <img src={paymentUrl} alt="Payment proof" className="max-h-56 w-full object-cover" />
            </a>
          ) : (
            <a href={paymentUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-700 underline">
              Open payment proof
            </a>
          )}
        </div>
      ) : null}

      {canPreviewDocument ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student document</div>
          <a href={documentUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-700 underline">
            Open uploaded file
          </a>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {onApprove ? <Button onClick={() => onApprove(order.id)}>Approve</Button> : null}
        {onReject ? <Button variant="danger" onClick={() => setIsRejectFormOpen((current) => !current)}>Reject</Button> : null}
        {onProcess ? <Button variant="secondary" onClick={() => onProcess(order.id)}>Mark as Processing</Button> : null}
        {onComplete ? <Button onClick={() => onComplete(order.id)}>Mark as Done</Button> : null}
      </div>

      {onReject && isRejectFormOpen ? (
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
          <label className="block text-sm font-semibold text-rose-700">Reject reason</label>
          <textarea
            className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Explain why this order was rejected"
            rows={3}
          />
          {rejectError ? <p className="text-sm font-medium text-rose-700">{rejectError}</p> : null}
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void handleRejectSubmit()} disabled={isRejectSubmitting}>
              {isRejectSubmitting ? 'Submitting...' : 'Confirm reject'}
            </Button>
            <Button variant="secondary" onClick={() => setIsRejectFormOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
