import { Card } from '@/components/shared/card';
import { cn } from '@/lib/utils';
import type { ShopPickerShop } from '@/lib/shops';

export function StudentShopCard({
  shop,
  selected = false,
  onClick,
}: {
  shop: ShopPickerShop;
  selected?: boolean;
  onClick: () => void;
}) {
  const waitChipClass =
    shop.waitTone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : shop.waitTone === 'amber'
        ? 'bg-amber-50 text-amber-700 ring-amber-100'
        : 'bg-rose-50 text-rose-700 ring-rose-100';

  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card
        className={cn(
          'h-full space-y-4 border border-transparent p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md',
          selected ? 'ring-2 ring-brand-500' : 'hover:ring-1 hover:ring-brand-100',
        )}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-base font-semibold text-slate-950">{shop.name}</h3>
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ring-1',
                shop.is_open ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-rose-50 text-rose-700 ring-rose-100',
              )}
            >
              {shop.is_open ? 'Open Now' : 'Closed'}
            </span>
          </div>
          <span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1', waitChipClass)}>{shop.waitLabel}</span>
        </div>

        <div className="space-y-1 text-sm text-slate-600">
          <div>{shop.queueDepth} orders in queue</div>
          <div>Avg. service: {Math.max(1, Math.round(shop.avg_time_per_10_pages))} min / 10 pages</div>
        </div>
      </Card>
    </button>
  );
}