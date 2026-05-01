export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel max-w-md p-8 text-center">
        <h1 className="font-[var(--font-space-grotesk)] text-3xl font-semibold text-slate-950">You are offline</h1>
        <p className="mt-3 text-slate-600">Reconnect to continue using PrintQ.</p>
      </div>
    </main>
  );
}
