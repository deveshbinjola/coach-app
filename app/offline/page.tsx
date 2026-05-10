import BrandLogo from "@/components/BrandLogo";

export default function OfflinePage() {
  return (
    <main className="min-h-screen px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-center shadow-[var(--shadow-lg)]">
        <div className="flex justify-center">
          <BrandLogo iconSize={40} productLabel="Coach" />
        </div>
        <h1 className="mt-6 text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)]">
          You are offline.
        </h1>
        <p className="mt-2 text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
          ElevateAI needs a connection for live leads, voice imports, and drafting.
          Come back online and refresh.
        </p>
      </section>
    </main>
  );
}
