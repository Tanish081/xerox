"use client";

import { cn } from '@/lib/utils';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  title?: string;
  onClose: () => void;
  className?: string;
}>;

export function BottomSheet({ open, title, onClose, className, children }: BottomSheetProps) {
  const [rendered, setRendered] = useState(open);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open && rendered) {
      const timer = window.setTimeout(() => setRendered(false), 220);
      return () => window.clearTimeout(timer);
    }

    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, rendered]);

  if (!rendered) {
    return null;
  }

  return (
    <div className={cn('fixed inset-0 z-50 flex items-end justify-center', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <button aria-label="Close sheet" className={cn('absolute inset-0 bg-slate-950/30 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full max-w-3xl rounded-t-3xl bg-white p-4 shadow-2xl transition-transform duration-200 sm:m-4 sm:rounded-3xl',
          open ? 'translate-y-0' : 'translate-y-full',
          className,
        )}
        onTouchStart={(event) => {
          dragStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(event) => {
          if (dragStartY.current === null) {
            return;
          }

          const endY = event.changedTouches[0]?.clientY ?? dragStartY.current;
          if (endY - dragStartY.current > 70) {
            onClose();
          }

          dragStartY.current = null;
        }}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
        {title ? <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}