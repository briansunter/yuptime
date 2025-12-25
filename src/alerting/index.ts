/**
 * Alerting system - complete alert handling pipeline
 */

export {
  formatAlertMessage,
  getPreviousHeartbeat,
  handleIncident,
  processAlertEvent,
  shouldTriggerAlert,
} from "./alert-engine";
export { handleAlertEvent } from "./coordinator";
export {
  getPendingNotifications,
  isDuplicate,
  isRateLimited,
  markAsFailed,
  markAsSent,
  queueAlertForDelivery,
  queueAlertsForDelivery,
} from "./delivery-engine";
export { startDeliveryWorker, stopDeliveryWorker } from "./delivery-worker";
export { buildRoutingTable, findMatchingPolicies } from "./policy-matcher";
export { deliverNotification } from "./providers";
export type {
  AlertEvent,
  AlertToDeliver,
  MatchedPolicy,
  MonitorState,
  NotificationDeliveryQueueItem,
  ProviderDeliveryResult,
} from "./types";
