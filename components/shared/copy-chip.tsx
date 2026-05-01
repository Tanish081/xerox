"use client";

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';
import { useEffect, useState } from 'react';

type CopyChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  label?: string;
};

export function CopyChip({ value, label = 'Tap to copy', className, ...props }: CopyChipProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-700',
        className,
      )}
      onClick={() => void copyValue()}
      {...props}
    >
      <span>{copied ? 'Copied ✓' : value}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-70">{copied ? 'Done' : label}</span>
    </button>
  );
}