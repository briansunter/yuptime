export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome to KubeKuma monitoring</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Monitors Up</div>
          <div className="text-3xl font-bold text-status-up">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Monitors Down</div>
          <div className="text-3xl font-bold text-status-down">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Monitors Pending</div>
          <div className="text-3xl font-bold text-status-pending">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Active Incidents</div>
          <div className="text-3xl font-bold text-status-down">0</div>
        </div>
      </div>

      {/* Placeholder for upcoming features */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="font-semibold text-blue-900 mb-2">Coming Soon</h2>
        <p className="text-blue-800">
          The KubeKuma dashboard is being built. Check back soon for:
        </p>
        <ul className="list-disc list-inside text-blue-800 mt-2 space-y-1">
          <li>Monitor status overview</li>
          <li>Recent incidents timeline</li>
          <li>Uptime statistics</li>
          <li>Alert notifications</li>
        </ul>
      </div>
    </div>
  );
}
