'use client';

import { supabaseBrowser } from '@/lib/supabase';
import { useEffect, useState } from 'react';

type Kind = { label: string; icon: string; opensInBrowser: boolean };

/** What the browser will do with this file when the tab opens. */
function classify(name: string): Kind {
  const ext = (name.split('.').at(-1) ?? '').toLowerCase();
  if (ext === 'pdf') return { label: 'PDF', icon: '📄', opensInBrowser: true };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return { label: 'Image', icon: '🖼', opensInBrowser: true };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return { label: 'Word', icon: '📝', opensInBrowser: false };
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return { label: 'Excel', icon: '📊', opensInBrowser: false };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PowerPoint', icon: '📽', opensInBrowser: false };
  return { label: ext ? ext.toUpperCase() : 'File', icon: '📎', opensInBrowser: false };
}

/**
 * "Preview document" for an operator. Opens the uploaded file in a new tab:
 * PDFs and images render inline in the browser, Office files download and open
 * in Word/Excel/PowerPoint.
 */
export function DocumentPreviewLink({
  orderId,
  fileName,
  compact = false,
}: {
  orderId: string;
  fileName?: string | null;
  compact?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState(fileName ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session?.access_token) {
        if (!cancelled) { setLoading(false); setError('Sign in again to view documents.'); }
        return;
      }

      const res = await fetch(`/api/operator/document-url?orderId=${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({}));
      if (cancelled) return;

      setLoading(false);
      if (!res.ok) {
        setError(payload.error ?? 'Could not load the document.');
        return;
      }
      setUrl(payload.signedUrl ?? '');
      if (payload.fileName) setName(payload.fileName);
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return <p className="text-xs text-slate-400">Preparing document…</p>;
  }

  if (error) {
    return <p className="text-xs text-amber-700">{error}</p>;
  }

  if (!url) {
    return <p className="text-xs text-slate-400">No document uploaded.</p>;
  }

  const kind = classify(name);

  return (
    <div className={compact ? '' : 'space-y-1'}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
      >
        <span aria-hidden>{kind.icon}</span>
        Preview document
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">{kind.label}</span>
      </a>
      {!compact ? (
        <p className="text-[11px] text-slate-500">
          {name}
          {kind.opensInBrowser ? ' — opens in a new tab' : ` — downloads and opens in ${kind.label}`}
        </p>
      ) : null}
    </div>
  );
}
