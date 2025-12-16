import { Outlet } from "@tanstack/react-router";

export default function RootLayout() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-4">
        <h1 className="text-2xl font-bold mb-8">KubeKuma</h1>
        <nav className="space-y-2">
          <a href="/" className="block px-4 py-2 rounded hover:bg-slate-800">
            Dashboard
          </a>
          <a href="/monitors" className="block px-4 py-2 rounded hover:bg-slate-800">
            Monitors
          </a>
          <a href="/status-pages" className="block px-4 py-2 rounded hover:bg-slate-800">
            Status Pages
          </a>
          <a href="/notifications" className="block px-4 py-2 rounded hover:bg-slate-800">
            Notifications
          </a>
          <a href="/settings" className="block px-4 py-2 rounded hover:bg-slate-800">
            Settings
          </a>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <h2 className="text-xl font-semibold">Kubernetes Monitoring</h2>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
