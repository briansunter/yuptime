export * from "./common";
export * from "./maintenance-window";
export * from "./monitor";
export * from "./monitor-set";
export * from "./settings";
export * from "./silence";

// Union type of all CRDs for generic handling
export type AnyCRD =
  | Monitor
  | MonitorSet
  | MaintenanceWindow
  | Silence
  | YuptimeSettings;

// Import statement to keep these defined
import type {
  MaintenanceWindow,
  Monitor,
  MonitorSet,
  Silence,
  YuptimeSettings,
} from "./index";
