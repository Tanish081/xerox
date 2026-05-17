import Link from 'next/link';

const highlights = [
  'Token-based queue for fast campus print shops',
  'UPI-first student flow with screenshot validation',
  'Tablet-friendly operator dashboard with live updates',
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-4 py-2 text-sm font-medium text-brand-700 shadow-sm">
            PrintQ for campus xerox shops
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl font-[var(--font-space-grotesk)] text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
              Manage student print queues without the paper chaos.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              A mobile-first print shop system for colleges in India with token generation,
              payment screenshot validation, realtime queue updates, and a tablet dashboard for operators.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/user-choice" className="rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white shadow-glow transition hover:bg-brand-700">
              User login
            </Link>
            <Link href="/operator/login" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-900 transition hover:border-brand-300 hover:text-brand-700">
              Operator login
            </Link>
            <Link href="/operator/signup" className="rounded-2xl border border-slate-300 bg-slate-50 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900">
              Register Shop
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {highlights.map((item) => (
              <div key={item} className="glass-panel p-4 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel overflow-hidden p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Demo shop</p>
              <h2 className="text-2xl font-semibold text-slate-950">Vijay Xerox, IIT Campus</h2>
            </div>
            <div className="rounded-2xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">Open</div>
          </div>
          <div className="space-y-4 rounded-3xl bg-slate-950 p-5 text-white">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Next token</span>
              <span>ETA 12 mins</span>
            </div>
            <div className="font-[var(--font-space-grotesk)] text-5xl font-bold tracking-tight">PQ-0504-B-007</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-3">
                <div className="text-slate-400">Pending</div>
                <div className="text-lg font-semibold">08</div>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <div className="text-slate-400">Queued</div>
                <div className="text-lg font-semibold">14</div>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <div className="text-slate-400">Done</div>
                <div className="text-lg font-semibold">31</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
