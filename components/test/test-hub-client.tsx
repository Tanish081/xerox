'use client';

import Link from 'next/link';
import { Button } from '@/components/shared/button';

export function TestHubClient() {
  const handleSetup = async () => {
    try {
      const res = await fetch('/api/test/setup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(
          data.message +
            '\n\nOperator: ' +
            data.operatorEmail +
            '\nPassword: ' +
            data.operatorPassword +
            `\n\nSeeded shops: ${data.inventorySeededShops ?? 0}` +
            `\nSeeded items: ${data.inventorySeededItems ?? 0}`,
        );
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      alert('Failed to setup test environment.');
    }
  };

  return (
    <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-6">
      <h3 className="mb-2 text-lg font-bold text-rose-900">🛠️ Developer Testing Hub</h3>
      <p className="mb-4 text-sm text-rose-700">Use these tools to test the end-to-end flow without real WhatsApp or Payment gateways.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSetup} className="bg-rose-600 text-white hover:bg-rose-700 rounded-xl border-none">
          1. Auto-Setup Test DB
        </Button>
        <Link href="/whatsapp-simulator" className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-700 border border-rose-200 hover:bg-rose-100 transition">
          2. Open WhatsApp Simulator
        </Link>
      </div>
      <p className="mt-4 text-xs text-rose-600 italic">Test Account: operator@printq.test / password123</p>
    </div>
  );
}
