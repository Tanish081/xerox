'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/shared/button';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';

export function OperatorInventoryClient() {
  const searchParams = useSearchParams();
  const shopId = searchParams.get('shop_id');
  const router = useRouter();
  
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState('');
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStock, setNewItemStock] = useState('10');
  const [newItemImageFile, setNewItemImageFile] = useState<File | null>(null);
  const [newItemImagePreview, setNewItemImagePreview] = useState('');
  const [updatingImageItemId, setUpdatingImageItemId] = useState<string | null>(null);
  const [setupWarning, setSetupWarning] = useState('');

  useEffect(() => {
    async function loadAuth() {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      setAuthToken(session?.access_token ?? '');
    }
    void loadAuth();
  }, []);

  useEffect(() => {
    async function checkSetup() {
      const response = await fetch('/api/health', { method: 'POST' });
      const payload = (await response.json()) as { ok?: boolean; missing?: string[] };
      if (!response.ok || !payload.ok) {
        const missing = payload.missing?.length ? payload.missing.join(', ') : 'required Supabase setup';
        setSetupWarning(`Supabase setup incomplete: ${missing}. Run the SQL migration before using inventory.`);
      }
    }

    void checkSetup();
  }, []);

  useEffect(() => {
    if (shopId && authToken) {
      void fetchItems();
    }
  }, [shopId, authToken]);

  const fetchItems = async () => {
    if (!shopId || !authToken) return;
    setLoading(true);
    const response = await fetch(`/api/operator/inventory?shopId=${encodeURIComponent(shopId)}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    const payload = (await response.json()) as { data?: any[] };
    if (response.ok) {
      setItems(payload.data ?? []);
    }
    setLoading(false);
  };

  const uploadProductImage = async (itemName: string, file: File) => {
    if (!shopId || !authToken) return null;

    const form = new FormData();
    form.append('shopId', shopId);
    form.append('itemName', itemName);
    form.append('image', file);

    const response = await fetch('/api/operator/inventory/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: form,
    });

    const payload = (await response.json()) as { imageUrl?: string; error?: string };
    if (!response.ok || !payload.imageUrl) {
      throw new Error(payload.error ?? 'Image upload failed');
    }

    return payload.imageUrl;
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopId || !authToken || !newItemName || !newItemPrice) return;

    try {
      const imageUrl = newItemImageFile ? await uploadProductImage(newItemName, newItemImageFile) : null;

      const response = await fetch('/api/operator/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          shopId,
          name: newItemName,
          price: Number(newItemPrice),
          stockQuantity: Number(newItemStock),
          imageUrl,
          isAvailable: Number(newItemStock) > 0,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to add item');
      }

      setNewItemName('');
      setNewItemPrice('');
      setNewItemStock('10');
      setNewItemImageFile(null);
      setNewItemImagePreview('');
      await fetchItems();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add item');
    }
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    if (!shopId || !authToken) return;
    await fetch('/api/operator/inventory', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        itemId: id,
        shopId,
        isAvailable: !current,
      }),
    });
    await fetchItems();
  };

  const updateStock = async (id: string, newStock: number) => {
    if (!shopId || !authToken) return;
    if (newStock < 0) return;
    await fetch('/api/operator/inventory', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        itemId: id,
        shopId,
        stockQuantity: newStock,
        isAvailable: newStock > 0,
      }),
    });
    await fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!shopId || !authToken) return;
    if (confirm("Are you sure you want to delete this item?")) {
      await fetch('/api/operator/inventory', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ itemId: id, shopId }),
      });
      await fetchItems();
    }
  };

  const updateItemImage = async (id: string, name: string, file: File) => {
    if (!shopId || !authToken) return;
    setUpdatingImageItemId(id);
    try {
      const imageUrl = await uploadProductImage(name, file);
      await fetch('/api/operator/inventory', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ itemId: id, shopId, imageUrl }),
      });
      await fetchItems();
    } finally {
      setUpdatingImageItemId(null);
    }
  };

  if (!shopId) return <div className="p-8">Please provide ?shop_id= in the URL.</div>;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between bg-slate-950 p-6 rounded-3xl text-white">
        <div>
          <p className="text-sm text-slate-300">Store Management</p>
          <h1 className="text-3xl font-bold tracking-tight">Stationery Inventory</h1>
        </div>
        <Button variant="secondary" className="rounded-full px-6" onClick={() => router.push('/operator/dashboard')}>
          Back to Dashboard
        </Button>
      </div>

      <div className="glass-panel p-6">
        {setupWarning ? (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{setupWarning}</div>
        ) : null}
        <h2 className="mb-4 text-xl font-semibold">Add New Item</h2>
        <form onSubmit={handleAddItem} className="grid gap-4 md:grid-cols-5 items-end">
          <div className="space-y-1">
            <Label htmlFor="itemName">Item Name</Label>
            <Input id="itemName" placeholder="e.g. Blue Pen" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="itemPrice">Price (₹)</Label>
            <Input id="itemPrice" type="number" step="0.01" placeholder="₹" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="itemStock">Stock</Label>
            <Input id="itemStock" type="number" placeholder="Qty" value={newItemStock} onChange={(e) => setNewItemStock(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="itemImage">Product Image (Optional)</Label>
            <Input
              id="itemImage"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setNewItemImageFile(file);
                setNewItemImagePreview(file ? URL.createObjectURL(file) : '');
              }}
            />
          </div>
          <Button type="submit" className="rounded-xl w-full h-10">Add Item</Button>
        </form>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500 mb-4">Current Inventory</h3>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <p className="text-slate-500">Loading items...</p>
          ) : items.length === 0 ? (
            <p className="text-slate-500 col-span-full">No items added yet. Add some stationery to sell!</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col transition ${!item.is_available ? 'opacity-60 grayscale' : ''}`}>
                <div className="h-40 w-full overflow-hidden bg-slate-100">
                  <img src={item.image_url || newItemImagePreview || 'https://images.unsplash.com/photo-1583485088034-697b5a69f000?auto=format&fit=crop&q=80&w=400'} alt={item.name} className="h-full w-full object-cover" />
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">{item.name}</h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 shrink-0">
                      ₹{item.price}
                    </span>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs font-semibold text-slate-500">STOCK</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateStock(item.id, item.stock_quantity - 1)} className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200">-</button>
                      <span className="font-semibold text-slate-900 w-6 text-center">{item.stock_quantity}</span>
                      <button onClick={() => updateStock(item.id, item.stock_quantity + 1)} className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200">+</button>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button 
                      variant="secondary" 
                      onClick={() => toggleAvailability(item.id, item.is_available)}
                      className={`flex-1 text-xs ${item.is_available ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    >
                      {item.is_available ? 'Pause' : 'Activate'}
                    </Button>
                    <Button variant="secondary" onClick={() => deleteItem(item.id)} className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100">
                      Delete
                    </Button>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-semibold text-slate-500">Update product image</label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void updateItemImage(item.id, item.name, file);
                      }}
                      disabled={updatingImageItemId === item.id}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
