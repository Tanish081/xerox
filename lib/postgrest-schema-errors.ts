/** Maps PostgREST errors to actionable messages when the remote DB is behind repo schema. */
export function ordersStationaryCartHint(err: unknown): string | null {
  const o = err as { code?: string; message?: string };
  const message = o?.message ?? '';
  const code = o?.code ?? '';
  if (
    code === 'PGRST204' ||
    message.includes('stationary_cart') ||
    message.includes("Could not find the 'stationary_cart'")
  ) {
    return (
      'Database missing orders.stationary_cart. In Supabase → SQL Editor run: ' +
      "alter table public.orders add column if not exists stationary_cart jsonb not null default '[]'::jsonb;"
    );
  }
  return null;
}
