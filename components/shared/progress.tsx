export function Progress({ value }: { value: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}
