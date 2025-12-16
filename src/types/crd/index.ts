export * from "./common";
export * from "./monitor";
export * from "./monitor-set";
export * from "./notification-provider";
export * from "./notification-policy";
export * from "./status-page";
export * from "./maintenance-window";
export * from "./silence";
export * from "./local-user";
export * from "./api-key";
export * from "./settings";

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
  | KubeKumaSettings;

// Import statement to keep these defined
import type {
  Monitor,
  MonitorSet,
  NotificationProvider,
  NotificationPolicy,
  StatusPage,
  MaintenanceWindow,
  Silence,
  LocalUser,
  ApiKey,
  KubeKumaSettings,
} from "./index";
