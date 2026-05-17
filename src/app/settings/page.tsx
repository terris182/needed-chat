import { TabBar } from "@/components/ui/tab-bar";

export default function SettingsPage() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-sm border-b border-border-light px-4 py-3">
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        <div className="bg-surface rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-text-primary">Account</p>
          <p className="text-xs text-text-tertiary mt-1">Manage your plan, notifications, and privacy.</p>
        </div>
      </main>

      <TabBar />
    </div>
  );
}
