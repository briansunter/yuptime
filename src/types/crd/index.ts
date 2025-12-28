export * from "./api-key";
export * from "./common";
export * from "./local-user";
export * from "./maintenance-window";
export * from "./monitor";
export * from "./monitor-set";
export * from "./notification-policy";
export * from "./notification-provider";
export * from "./settings";
export * from "./silence";
export * from "./status-page";

// Union type of all CRDs for generic handling
export type AnyCRD =
  | Monitor
  | MonitorSet
  | NotificationProvider
  | NotificationPolicy
  | StatusPage
  | MaintenanceWindow
  | Silence
  | LocalUser
  | ApiKey
  | YuptimeSettings;

// Import statement to keep these defined
import type {
  ApiKey,
  LocalUser,
  MaintenanceWindow,
  Monitor,
  MonitorSet,
  NotificationPolicy,
  NotificationProvider,
  Silence,
  StatusPage,
  YuptimeSettings,
} from "./index";
