import type { PrintSettings } from '@/types';

function parsePageCount(pages: string) {
  const trimmed = pages.trim().toLowerCase();
  if (trimmed === 'all') {
    return 1;
  }

  const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    return 1;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  return Math.max(1, end - start + 1);
}

export function calculatePrice(settings: PrintSettings, filePageCount: number) {
  const pages = settings.pages.trim().toLowerCase() === 'all' ? filePageCount : parsePageCount(settings.pages);
  const perPage = settings.color === 'color' ? 5 : settings.side === 'double' ? 1.5 : 1;
  const sizeMultiplier = settings.size === 'A3' ? 2 : 1;
  return Math.round(pages * perPage * sizeMultiplier * settings.copies * 100) / 100;
}
