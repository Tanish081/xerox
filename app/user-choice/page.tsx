'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { setUserType } from '@/lib/student-session';
import { useRouter } from 'next/navigation';

export default function UserChoicePage() {
  const router = useRouter();

  const handleChoice = (type: 'student' | 'staff') => {
    setUserType(type);
    // Staff have their own section — routing them through /student/login sent
    // anyone with an existing session straight back to the student area.
    router.push(type === 'staff' ? '/staff/login' : '/student/login');
  };

  return (
    <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center p-4">
      <Card className="mx-auto w-full max-w-md space-y-8 p-8">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-700">PrintQ</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Who are you?</h2>
          <p className="text-sm text-slate-600">Please select your role to continue.</p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => handleChoice('student')}
            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white p-6 text-center transition hover:border-brand-500 hover:bg-brand-50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl group-hover:scale-110 transition">🎓</div>
            <div>
              <h3 className="text-lg font-bold text-slate-950">I am a Student</h3>
              <p className="text-sm text-slate-500">I want to print my documents/notes</p>
            </div>
          </button>

          <button
            onClick={() => handleChoice('staff')}
            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white p-6 text-center transition hover:border-brand-500 hover:bg-brand-50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl group-hover:scale-110 transition">👔</div>
            <div>
              <h3 className="text-lg font-bold text-slate-950">I am a Staff</h3>
              <p className="text-sm text-slate-500">I am faculty or administrative staff</p>
            </div>
          </button>
        </div>

        <div className="text-center">
          <Button variant="secondary" onClick={() => router.push('/')}>Back to Home</Button>
        </div>
      </Card>
    </div>
  );
}
