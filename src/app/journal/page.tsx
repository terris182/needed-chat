import { TabBar } from "@/components/ui/tab-bar";

export default function JournalPage() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-sm border-b border-border-light px-4 py-3">
        <h1 className="text-lg font-semibold text-text-primary">Journal</h1>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        <p className="text-sm text-text-secondary">
          Your conversation highlights and reflections will be collected here as you participate in rooms.
        </p>
      </main>

      <TabBar />
    </div>
  );
}
