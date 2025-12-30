/**
 * Represents a monitor discovered from a Kubernetes Service or Ingress
 */
export interface DiscoveredMonitor {
  /** Generated monitor name (e.g., "auto-svc-my-service" or "auto-ing-my-ingress-example-com") */
  name: string;

  /** Namespace where the monitor should be created */
  namespace: string;

  /** Monitor type (http, tcp, grpc, etc.) */
  type: string;

  /** Check interval in seconds */
  intervalSeconds: number;

  /** Timeout in seconds */
  timeoutSeconds: number;

  /** Target configuration based on monitor type */
  target: {
    http?: {
      url: string;
      tls?: {
        verify?: boolean;
      };
    };
    tcp?: {
      host: string;
      port: number;
    };
    grpc?: {
      host: string;
      port: number;
    };
  };

  /** Source resource that triggered this discovery */
  source: {
    kind: "Service" | "Ingress";
    name: string;
    namespace: string;
  };
}
