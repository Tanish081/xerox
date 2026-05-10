'use client';

import { useState } from 'react';
import { Card } from '@/components/shared/card';
import { Button } from '@/components/shared/button';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';

export function WhatsAppSimulatorClient() {
  const [phoneNumber, setPhoneNumber] = useState('919876543210');
  const [messages, setMessages] = useState<{ sender: 'me' | 'bot'; text: string; time: string }[]>([
    { sender: 'bot', text: 'Welcome to the PrintQ WhatsApp Simulator. Send a document to test the flow!', time: new Date().toLocaleTimeString() }
  ]);
  const [loading, setLoading] = useState(false);

  const handleSendDocument = async () => {
    if (!phoneNumber) return alert('Enter a phone number');
    
    setLoading(true);
    
    // Add user message to UI
    setMessages(prev => [...prev, { sender: 'me', text: '📄 Mock_Document.pdf (Sent)', time: new Date().toLocaleTimeString() }]);

    // Mock the Meta WhatsApp Webhook Payload
    const mockPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'mock_waba_id',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '1234567890', phone_number_id: 'mock_phone_id' },
            contacts: [{ profile: { name: 'Test Student' }, wa_id: phoneNumber }],
            messages: [{
              from: phoneNumber,
              id: 'wamid.mock_message_id',
              timestamp: Date.now().toString(),
              type: 'document',
              document: {
                filename: 'Mock_Document.pdf',
                mime_type: 'application/pdf',
                id: 'mock_document_media_id_123'
              }
            }]
          },
          field: 'messages'
        }]
      }]
    };

    try {
      const response = await fetch('/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      if (response.ok) {
        // Simulate bot reply (since we haven't implemented sending real WhatsApp messages back yet)
        setTimeout(() => {
          setMessages(prev => [...prev, { 
            sender: 'bot', 
            text: 'Webhook received the document successfully! Check your server console for the generated Razorpay test link.', 
            time: new Date().toLocaleTimeString() 
          }]);
          setLoading(false);
        }, 1500);
      } else {
        throw new Error('Webhook rejected');
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Error: Failed to reach webhook endpoint.', time: new Date().toLocaleTimeString() }]);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md overflow-hidden bg-white shadow-xl">
        {/* Header */}
        <div className="bg-[#075e54] p-4 text-white">
          <h2 className="text-lg font-bold">PrintQ Demo Shop</h2>
          <p className="text-xs text-emerald-100">WhatsApp Business Simulator</p>
        </div>

        {/* Settings */}
        <div className="bg-slate-100 p-4 text-sm border-b border-slate-200">
          <Label htmlFor="phone" className="text-slate-600">Your Phone Number (Sender)</Label>
          <Input 
            id="phone" 
            value={phoneNumber} 
            onChange={e => setPhoneNumber(e.target.value)} 
            className="mt-1 bg-white" 
          />
        </div>

        {/* Chat Area */}
        <div className="h-96 overflow-y-auto bg-[#efeae2] p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${msg.sender === 'me' ? 'bg-[#dcf8c6]' : 'bg-white'}`}>
                <p>{msg.text}</p>
                <p className="mt-1 text-right text-[10px] text-slate-500">{msg.time}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-500 shadow-sm italic">
                Bot is typing...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-slate-100 p-3 flex gap-2">
          <Button 
            className="w-full rounded-full bg-[#128c7e] hover:bg-[#075e54]" 
            onClick={handleSendDocument}
            disabled={loading}
          >
            📎 Send Test PDF
          </Button>
        </div>
      </Card>
    </div>
  );
}
