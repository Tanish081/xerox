import type { PrintSettings } from '@/types';

/** Staff jobs printing more sheets than this need their HOD's sign-off. */
export const HOD_APPROVAL_PAGE_THRESHOLD = 500;

function selectedPageCount(pages: string, filePageCount: number) {
  const trimmed = pages.trim().toLowerCase();
  if (trimmed === 'all') return Math.max(1, filePageCount);

  const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return Math.max(1, filePageCount);

  return Math.max(1, Number(match[2]) - Number(match[1]) + 1);
}

/**
 * Total sheets the job will actually print — selected pages x copies. This is
 * what the threshold is measured against, so 100 pages x 6 copies counts as 600.
 */
export function totalPrintedPages(settings: PrintSettings, filePageCount: number): number {
  const pages = selectedPageCount(settings.pages ?? 'all', filePageCount || 1);
  const copies = Math.max(1, Number(settings.copies) || 1);
  return pages * copies;
}

export function needsHodApproval(totalPages: number): boolean {
  return totalPages > HOD_APPROVAL_PAGE_THRESHOLD;
}
