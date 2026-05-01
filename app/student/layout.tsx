export default function StudentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
      {children}
    </main>
  );
}
