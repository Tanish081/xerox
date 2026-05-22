"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { CopyChip } from '@/components/shared/copy-chip';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Order } from '@/types';
import { displayToken } from '@/lib/token';
import { useEffect, useMemo, useState } from 'react';

function isImageFile(path: string) {
  const lower = path.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
}

export function OperatorOrderCardPolished({
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
  const [paymentStoragePath, setPaymentStoragePath] = useState(order.payment_screenshot_url ?? '');
  const [paymentUrlLoading, setPaymentUrlLoading] = useState(Boolean(order.payment_screenshot_url || order.payment_verified));
  const [documentUrl, setDocumentUrl] = useState('');
  const [isRejectFormOpen, setIsRejectFormOpen] = useState(false);
  const [isRejectSubmitting, setIsRejectSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewIsImage, setPreviewIsImage] = useState(false);
  const [screenshotExpanded, setScreenshotExpanded] = useState(
    order.status === 'pending_approval', // auto-expand for pending orders
  );

  useEffect(() => {
    async function loadSignedUrls() {
      const { supabaseBrowser } = await import('@/lib/supabase');

      // Use server-side endpoint so supabaseAdmin bypasses RLS for screenshot lookup
      const res = await fetch(`/api/operator/screenshot-url?orderId=${encodeURIComponent(order.id)}`);
      if (res.ok) {
        const payload = (await res.json()) as { signedUrl?: string | null; storagePath?: string };
        setPaymentUrl(payload.signedUrl ?? '');
        if (payload.storagePath) setPaymentStoragePath(payload.storagePath);
      }
      setPaymentUrlLoading(false);

      if (order.file_url) {
        const { data } = await supabaseBrowser.storage
          .from('print-files')
          .createSignedUrl(order.file_url, 3600);
        setDocumentUrl(data?.signedUrl ?? '');
      } else {
        setDocumentUrl('');
      }
    }

    void loadSignedUrls();
  }, [order.id, order.file_url]);

  const canPreviewPayment = useMemo(() => Boolean(paymentUrl), [paymentUrl]);
  const canPreviewDocument = useMemo(() => Boolean(documentUrl), [documentUrl]);

  async function handleRejectSubmit() {
    if (!onReject) return;
    if (rejectReason.trim().length < 5) {
      setRejectError('Please add at least 5 characters.');
      return;
    }
    setRejectError('');
    setIsRejectSubmitting(true);
    onReject(order.id, rejectReason.trim());
    setIsRejectSubmitting(false);
    setIsRejectFormOpen(false);
    setRejectReason('');
  }

  const paymentInitiatedAt = (order as any).payment_initiated_at as string | null | undefined;

  return (
    <>
      <Card className={`space-y-4 ${order.status === 'pending_approval' ? 'border-l-4 border-l-rose-500' : ''}`}>

        {/* ── Payment screenshot — shown first for pending approval ── */}
        {order.status === 'pending_approval' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment proof
              </span>
              <div className="flex items-center gap-2">
                {order.payment_verified ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Verified by system
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Unverified
                  </span>
                )}
                {canPreviewPayment && (
                  <button
                    type="button"
                    onClick={() => setScreenshotExpanded((v) => !v)}
                    className="text-[11px] font-semibold text-brand-600 underline underline-offset-2"
                  >
                    {screenshotExpanded ? 'Collapse' : 'Expand'}
                  </button>
                )}
              </div>
            </div>

            {paymentUrlLoading ? (
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ) : canPreviewPayment ? (
              screenshotExpanded ? (
                <button
                  type="button"
                  onClick={() => { setPreviewUrl(paymentUrl); setPreviewIsImage(isImageFile(paymentStoragePath)); }}
                  className="block w-full overflow-hidden rounded-xl ring-2 ring-brand-200 hover:ring-brand-400 transition"
                >
                  {isImageFile(paymentStoragePath) ? (
                    <img
                      src={paymentUrl}
                      alt="Payment proof"
                      className="w-full object-contain max-h-72 bg-slate-900"
                    />
                  ) : (
                    <div className="bg-slate-50 px-4 py-6 text-sm font-semibold text-brand-700">
                      Open payment proof
                    </div>
                  )}
                  <div className="bg-brand-50 px-3 py-1.5 text-xs text-brand-700 font-medium text-center">
                    Tap to view full size
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setScreenshotExpanded(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition"
                >
                  <span className="text-lg">🖼</span>
                  <span>Screenshot uploaded — tap to view</span>
                </button>
              )
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-400 text-center">
                No payment screenshot uploaded
              </div>
            )}

            {/* Payment metadata */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="font-semibold text-slate-500 mb-0.5">UTR / Ref</div>
                {order.utr_number
                  ? <CopyChip value={order.utr_number} label={order.utr_number} />
                  : <span className="text-slate-400">Not provided</span>}
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="font-semibold text-slate-500 mb-0.5">Paid at</div>
                <span className="text-slate-700">
                  {paymentInitiatedAt
                    ? new Date(paymentInitiatedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                    : <span className="text-slate-400">Unknown</span>}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Order header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="font-[var(--font-space-grotesk)] text-4xl font-bold tracking-tight text-brand-700">
                {displayToken(order.token)}
              </div>
              <StatusBadge status={order.status} />
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              {order.student?.name ?? 'User order'}
              <span className="ml-2 text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full">
                {order.student?.user_type || 'student'}
              </span>
            </h3>
            <p className="text-sm text-slate-600">
              {order.student?.user_type === 'staff'
                ? `Dept: ${order.student?.department || '--'}`
                : `Roll: ${order.student?.roll_no || '--'}`}
            </p>
            <p className="text-xs text-slate-500 mt-1">{order.file_name ?? 'Document'}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div>{order.priority_class} class</div>
            <div className="font-semibold text-slate-800">₹{order.estimated_amount ?? 0}</div>
          </div>
        </div>

        {/* ETA — only relevant for non-pending orders */}
        {order.status !== 'pending_approval' && (
          <div className="space-y-2 text-sm text-slate-700">
            <div>UTR: {order.utr_number ? <CopyChip value={order.utr_number} label="Copy UTR" /> : <span className="text-slate-400">Not added</span>}</div>
            <div>ETA: {order.estimated_ready_time ? new Date(order.estimated_ready_time).toLocaleString('en-IN') : 'Calculating'}</div>
          </div>
        )}

        {/* Payment screenshot for non-pending orders (compact) */}
        {order.status !== 'pending_approval' && canPreviewPayment && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment screenshot</div>
            <button type="button" onClick={() => { setPreviewUrl(paymentUrl); setPreviewIsImage(isImageFile(paymentStoragePath)); }} className="block overflow-hidden rounded-xl ring-1 ring-slate-200">
              {isImageFile(paymentStoragePath) ? (
                <img src={paymentUrl} alt="Payment proof" className="max-h-44 w-full object-cover" />
              ) : (
                <div className="bg-slate-50 px-4 py-6 text-sm font-semibold text-brand-700">Open payment proof</div>
              )}
            </button>
          </div>
        )}

        {canPreviewDocument ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student document</div>
            <button type="button" onClick={() => { setPreviewUrl(documentUrl); setPreviewIsImage(isImageFile(order.file_url ?? '')); }} className="text-sm font-semibold text-brand-700 underline underline-offset-4">
              Open uploaded file
            </button>
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {onApprove ? <Button onClick={() => onApprove(order.id)}>Approve</Button> : null}
          {onReject ? <Button variant="danger" onClick={() => setIsRejectFormOpen((current) => !current)}>Reject</Button> : null}
          {onProcess ? <Button variant="secondary" onClick={() => onProcess(order.id)}>Start</Button> : null}
          {onComplete ? <Button onClick={() => onComplete(order.id)}>Done</Button> : null}
        </div>

        {onReject && isRejectFormOpen ? (
          <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
            <label className="block text-sm font-semibold text-rose-700">Reject reason</label>
            <textarea
              className="w-full rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-rose-200 outline-none focus:ring-2 focus:ring-rose-400"
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

      {/* Full-size preview modal */}
      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" className="absolute inset-0" aria-label="Close preview" onClick={() => setPreviewUrl('')} />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Payment screenshot</div>
              <Button variant="secondary" onClick={() => setPreviewUrl('')}>Close</Button>
            </div>
            {previewIsImage
              ? <img src={previewUrl} alt="Preview" className="max-h-[80vh] w-full object-contain bg-slate-900" />
              : <iframe src={previewUrl} title="Preview" className="h-[80vh] w-full" />}
          </div>
        </div>
      ) : null}
    </>
  );
}
