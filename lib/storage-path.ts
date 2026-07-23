/**
 * Makes a user-supplied filename safe to use inside a Supabase Storage key.
 *
 * Storage rejects keys containing characters like `[`, `]`, `#`, `?` with
 * "Invalid key" — browsers hand us names like
 * `Encyclopedia_of_Chess_Combinations_4th_ed[1].pdf` all the time (the `[1]`
 * comes from duplicate-download naming). Only the storage path is sanitised;
 * the original name is still stored on the order for display.
 */
export function storageSafeFileName(name: string): string {
  const trimmed = (name ?? '').trim();
  const lastDot = trimmed.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1;

  const rawBase = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const rawExt = hasExt ? trimmed.slice(lastDot + 1) : '';

  const clean = (value: string) =>
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '_') // anything outside the safe set
      .replace(/_{2,}/g, '_')            // collapse runs
      .replace(/^[._-]+|[._-]+$/g, '');  // no leading/trailing punctuation

  // Cap the base so long titles can't blow past the key length limit.
  const base = clean(rawBase).slice(0, 100) || 'document';
  const ext = clean(rawExt).slice(0, 10);

  return ext ? `${base}.${ext}` : base;
}
