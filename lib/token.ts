import type { PriorityClass } from '@/types';

function parseSequenceFromToken(token: string) {
  const trailing = token.match(/(\d+)$/)?.[1];
  if (!trailing) {
    return 1;
  }

  const value = Number(trailing);
  if (Number.isNaN(value) || value <= 0) {
    return 1;
  }

  return value;
}

function formatShortToken(priorityClass: PriorityClass, sequence: number) {
  const bounded = ((sequence - 1) % 99) + 1;
  return `${priorityClass}${String(bounded).padStart(2, '0')}`;
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

  if (typeof data === 'string' && data.length > 0) {
    if (/^[ABC]\d{2}$/.test(data)) {
      return data;
    }

    return formatShortToken(priorityClass, parseSequenceFromToken(data));
  }

  return formatShortToken(priorityClass, 1);
}
