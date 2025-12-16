/**
 * Alerting system - complete alert handling pipeline
 */

export { handleAlertEvent } from "./coordinator";
export { startDeliveryWorker, stopDeliveryWorker } from "./delivery-worker";
export { processAlertEvent, handleIncident, getPreviousHeartbeat, shouldTriggerAlert, formatAlertMessage } from "./alert-engine";
export { findMatchingPolicies, buildRoutingTable } from "./policy-matcher";
export { queueAlertForDelivery, queueAlertsForDelivery, getPendingNotifications, markAsSent, markAsFailed, isDuplicate, isRateLimited } from "./delivery-engine";
export { deliverNotification } from "./providers";
export type { AlertEvent, MatchedPolicy, AlertToDeliver, ProviderDeliveryResult, NotificationDeliveryQueueItem } from "./types";
