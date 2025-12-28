import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

interface Monitor {
  namespace: string;
  name: string;
  status: "operational" | "degraded" | "down";
  lastCheckedAt?: string;
  latency?: number;
}

interface StatusPageGroup {
  name: string;
  description?: string;
  monitors: Monitor[];
}

interface StatusPageData {
  slug: string;
  title: string;
  description?: string;
  publishedAt: string;
  overallStatus: "operational" | "degraded" | "down";
  groups: StatusPageGroup[];
  branding?: {
    logoUrl?: string;
    faviconUrl?: string;
    theme?: "light" | "dark" | "system";
  };
}

interface Incident {
  id: string;
  monitorId: string;
  startedAt: string;
  resolvedAt?: string;
  state: "down" | "flapping";
  reason?: string;
}

export default function PublicStatusPage() {
  const { slug } = useParams({ from: "/status/$slug" });
  const [pageData, setPageData] = useState<StatusPageData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [uptime30d, setUptime30d] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPageData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/v1/status/${slug}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Status page not found");
          } else {
            setError("Failed to load status page");
          }
          return;
        }

        const data = await response.json();
        setPageData(data);

        // Fetch incident data for each monitor
        const allIncidents: Incident[] = [];
        for (const group of data.groups || []) {
          for (const monitor of group.monitors || []) {
            try {
              const incidentRes = await fetch(
                `/api/v1/incidents?monitorId=${encodeURIComponent(
                  `${monitor.namespace}/${monitor.name}`
                )}&limit=10`
              );
              if (incidentRes.ok) {
                const incidentData = await incidentRes.json();
                allIncidents.push(...incidentData);
              }
            } catch {
              // Continue if incident fetch fails
            }
          }
        }
        setIncidents(allIncidents);

        // Fetch uptime data
        const uptimeData: Record<string, number> = {};
        for (const group of data.groups || []) {
          for (const monitor of group.monitors || []) {
            try {
              const uptimeRes = await fetch(
                `/api/v1/uptime/${encodeURIComponent(
                  `${monitor.namespace}/${monitor.name}`
                )}?days=30`
              );
              if (uptimeRes.ok) {
                const uptimeInfo = await uptimeRes.json();
                uptimeData[
                  `${monitor.namespace}/${monitor.name}`
                ] = uptimeInfo.uptime;
              }
            } catch {
              // Continue if uptime fetch fails
              uptimeData[
                `${monitor.namespace}/${monitor.name}`
              ] = 0;
            }
          }
        }
        setUptime30d(uptimeData);
      } catch (err) {
        setError("Failed to load status page");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPageData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading status page...</p>
        </div>
      </div>
    );
  }

  if (error || !pageData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error || "Status page not found"}</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "operational":
        return "bg-green-100 text-green-800 border-green-300";
      case "degraded":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "down":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "operational":
        return <CheckCircle className="h-6 w-6" />;
      case "degraded":
        return <AlertTriangle className="h-6 w-6" />;
      case "down":
        return <AlertCircle className="h-6 w-6" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "operational":
        return "All Systems Operational";
      case "degraded":
        return "Degraded Performance";
      case "down":
        return "Service Down";
      default:
        return "Unknown";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatLatency = (ms?: number) => {
    if (!ms) return "N/A";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {pageData.branding?.logoUrl && (
            <img
              src={pageData.branding.logoUrl}
              alt="Logo"
              className="h-10 w-10 mb-4"
            />
          )}
          <h1 className="text-3xl font-bold text-gray-900">
            {pageData.title}
          </h1>
          {pageData.description && (
            <p className="text-gray-600 mt-2">{pageData.description}</p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overall status */}
        <div
          className={`rounded-lg border-2 p-6 mb-8 flex items-center gap-4 ${getStatusColor(
            pageData.overallStatus
          )}`}
        >
          {getStatusIcon(pageData.overallStatus)}
          <div className="flex-1">
            <h2 className="text-2xl font-bold">
              {getStatusText(pageData.overallStatus)}
            </h2>
            <p className="text-sm opacity-75 mt-1">
              Last updated: {formatDate(pageData.publishedAt)}
            </p>
          </div>
        </div>

        {/* Monitor groups */}
        <div className="space-y-6">
          {pageData.groups.map((group) => (
            <div key={group.name} className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {group.name}
                </h3>
                {group.description && (
                  <p className="text-sm text-gray-600 mt-1">
                    {group.description}
                  </p>
                )}
              </div>

              <div className="divide-y divide-gray-200">
                {group.monitors.map((monitor) => {
                  const monitorId = `${monitor.namespace}/${monitor.name}`;
                  const uptime = uptime30d[monitorId];

                  return (
                    <div
                      key={monitorId}
                      className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(monitor.status)}
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {monitor.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {monitor.namespace}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8 text-right">
                        <div>
                          <p className="text-sm text-gray-600">Latency</p>
                          <p className="font-mono text-gray-900">
                            {formatLatency(monitor.latency)}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">
                            30-day Uptime
                          </p>
                          <p className="font-mono text-gray-900">
                            {uptime !== undefined
                              ? `${uptime.toFixed(2)}%`
                              : "N/A"}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                            monitor.status
                          )}`}>
                            {monitor.status.toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Incident timeline */}
        {incidents.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Recent Incidents
              </h3>
            </div>

            <div className="divide-y divide-gray-200">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {incident.state === "down" ? (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {incident.monitorId}
                        </p>
                        {incident.reason && (
                          <p className="text-sm text-gray-600 mt-1">
                            {incident.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-sm text-gray-600">
                      <p>{formatDate(incident.startedAt)}</p>
                      {incident.resolvedAt && (
                        <p className="text-green-600 font-medium">
                          Resolved: {formatDate(incident.resolvedAt)}
                        </p>
                      )}
                      {!incident.resolvedAt && (
                        <p className="text-red-600 font-medium">Ongoing</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500 border-t border-gray-200 pt-8">
          <p>
            Powered by{" "}
            <a
              href="https://github.com/kubekuma/kubekuma"
              className="text-blue-600 hover:text-blue-700"
            >
              KubeKuma
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
