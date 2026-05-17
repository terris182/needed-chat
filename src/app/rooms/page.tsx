import { TabBar } from "@/components/ui/tab-bar";

export default function RoomsPage() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-sm border-b border-border-light px-4 py-3">
        <h1 className="text-lg font-semibold text-text-primary">Rooms</h1>
      </header>

      <main className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {/* Invitations section */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-2">Invitations</h2>
          <p className="text-xs text-text-tertiary">No pending invitations.</p>
        </section>

        {/* My rooms */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-2">My rooms</h2>
          <p className="text-xs text-text-tertiary">
            Answer today&apos;s question to get matched with a room.
          </p>
        </section>
      </main>

      <TabBar />
    </div>
  );
}
