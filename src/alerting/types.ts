/**
 * Core types for the alerting system
 */

export interface AlertEvent {
  monitorId: string;
  monitorNamespace: string;
  monitorName: string;
  previousState: "up" | "down" | "pending" | "flapping" | "paused";
  currentState: "up" | "down" | "pending" | "flapping" | "paused";
  reason: string;
  message: string;
  latencyMs: number;
  timestamp: Date;
  isStateChange: boolean;
}

export interface MatchedPolicy {
  namespace: string;
  name: string;
  priority: number;
  providers: Array<{
    name: string;
    namespace: string;
  }>;
  triggers: {
    onDown: boolean;
    onUp: boolean;
    onFlapping: boolean;
    onCertExpiring: boolean;
  };
  dedup: {
    key?: string;
    windowMinutes: number;
  };
  rateLimit: {
    minMinutesBetweenAlerts: number;
  };
  resend: {
    resendIntervalMinutes: number;
  };
  formatting?: {
    titleTemplate?: string;
    bodyTemplate?: string;
  };
}

export interface AlertToDeliver {
  policyName: string;
  providerName: string;
  providerType: string;
  event: AlertEvent;
  incidentId: number;
  dedupKey: string;
  formattedTitle: string;
  formattedBody: string;
  metadata?: Record<string, any>;
}

export interface ProviderDeliveryResult {
  success: boolean;
  sentAt?: Date;
  error?: string;
}

export interface NotificationDeliveryQueueItem {
  id?: number;
  incidentId: number;
  monitorId: string;
  policyName: string;
  providerName: string;
  providerType: string;
  status: "pending" | "sent" | "failed" | "deduped";
  attempts: number;
  lastAttemptAt?: Date;
  lastError?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  sentAt?: Date;
}
