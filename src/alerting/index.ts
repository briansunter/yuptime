/**
 * Alerting system - simplified Alertmanager integration
 *
 * Direct integration with Prometheus Alertmanager:
 * - No notification providers
 * - No policy matching
 * - POST alerts directly to Alertmanager's /api/v1/alerts
 * - Users configure Alertmanager routing (receivers, routes, etc.)
 */

export { sendAlertToAlertmanager } from "./alert-engine";
