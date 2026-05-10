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
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStock, setNewItemStock] = useState('10');
  const [newItemImage, setNewItemImage] = useState('');

  useEffect(() => {
    if (shopId) {
      fetchItems();
    }
  }, [shopId]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabaseBrowser
      .from('stationary_items')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
      
    if (!error && data) setItems(data);
    setLoading(false);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopId || !newItemName || !newItemPrice) return;
    
    const { error } = await supabaseBrowser.from('stationary_items').insert({
      shop_id: shopId,
      name: newItemName,
      price: parseFloat(newItemPrice),
      stock_quantity: parseInt(newItemStock, 10),
      image_url: newItemImage || 'https://images.unsplash.com/photo-1583485088034-697b5a69f000?auto=format&fit=crop&q=80&w=400',
      is_available: true,
    });
    
    if (!error) {
      setNewItemName('');
      setNewItemPrice('');
      setNewItemStock('10');
      setNewItemImage('');
      fetchItems();
    } else {
      alert('Failed to add item: ' + error.message);
    }
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    await supabaseBrowser.from('stationary_items').update({ is_available: !current }).eq('id', id);
    fetchItems();
  };

  const updateStock = async (id: string, newStock: number) => {
    if (newStock < 0) return;
    await supabaseBrowser.from('stationary_items').update({ stock_quantity: newStock }).eq('id', id);
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      await supabaseBrowser.from('stationary_items').delete().eq('id', id);
      fetchItems();
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
            <Label htmlFor="itemImage">Image URL (Optional)</Label>
            <Input id="itemImage" placeholder="https://..." value={newItemImage} onChange={(e) => setNewItemImage(e.target.value)} />
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
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
