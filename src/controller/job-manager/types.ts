/**
 * Job Manager Types
 * Types for Kubernetes Job-based monitor check execution
 */

/**
 * Monitor CRD resource (simplified)
 */
export interface Monitor {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid: string;
    resourceVersion?: string;
    deletionTimestamp?: string;
    finalizers?: string[];
  };
  spec: any;
  status?: any;
}

/**
 * Job execution status
 */
export type JobStatus = "pending" | "running" | "succeeded" | "failed";

/**
 * Job manager configuration
 */
export interface JobManagerConfig {
  kubeConfig: any;
  concurrency: number; // Max parallel Jobs (default: 10)
  jobTTL: number; // Cleanup after seconds (default: 3600)
  namespace: string; // Default namespace for Jobs
}

/**
 * Job creation result
 */
export interface JobResult {
  jobName: string;
  namespace: string;
  monitorId: string;
}

/**
 * Job manager interface
 */
export interface JobManager {
  /**
   * Schedule a check for the given monitor
   */
  scheduleCheck(monitor: Monitor): Promise<JobResult>;

  /**
   * Cancel pending jobs for a monitor
   */
  cancelJob(namespace: string, monitorName: string): Promise<void>;

  /**
   * Get status of a job
   */
  getJobStatus(jobName: string, namespace: string): Promise<JobStatus>;

  /**
   * Cleanup old finished jobs
   */
  cleanupOldJobs(maxAgeSeconds: number): Promise<number>;

  /**
   * Start the job manager
   */
  start(): Promise<void>;

  /**
   * Stop the job manager
   */
  stop(): Promise<void>;
}
