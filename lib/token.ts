import type { PriorityClass } from '@/types';

// Convert a stored token to its short display form.
// Handles both legacy short form (B01) and full form (PQ-1805-B-001).
export function displayToken(token: string | null | undefined): string {
  if (!token) return '--';
  if (/^[ABC]\d{2}$/.test(token)) return token; // already short
  const match = token.match(/-([ABC])-(\d+)$/);
  if (match) {
    const seq = parseInt(match[2], 10);
    const bounded = ((seq - 1) % 99) + 1;
    return `${match[1]}${String(bounded).padStart(2, '0')}`;
  }
  return token;
}

export async function generateToken(
  shopId: string,
  priorityClass: PriorityClass,
  supabaseClient: {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
): Promise<string> {
  const { data, error } = await supabaseClient.rpc('generate_printq_token', {
    p_shop_id: shopId,
    p_priority_class: priorityClass,
  });

  if (error) {
    throw new Error(`Failed to generate token: ${error.message}`);
  }

  // Return the full date-scoped token (PQ-1805-B-001) so it is globally unique.
  // Use displayToken() wherever the token is rendered to users.
  if (typeof data === 'string' && data.length > 0) {
    return data;
  }

  throw new Error('Token generation returned an empty result.');
}
