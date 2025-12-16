import { logger } from "../lib/logger";
import { getCoordinationApiClient } from "../controller/k8s-client";

/**
 * Singleton lock using Kubernetes Lease resource
 * Ensures only one scheduler instance is active across pod replicas
 */

const LOCK_NAME = "kubekuma-scheduler-lock";
const LOCK_NAMESPACE = process.env.KUBE_NAMESPACE || "monitoring";
const LEASE_DURATION_SECONDS = 30;
const RENEW_INTERVAL_MS = 10000; // Renew every 10 seconds

interface LockState {
  held: boolean;
  lease: any;
  renewInterval: NodeJS.Timer | null;
}

const lockState: LockState = {
  held: false,
  lease: null,
  renewInterval: null,
};

/**
 * Acquire the singleton lock
 */
export async function acquireLock(): Promise<boolean> {
  try {
    const client = getCoordinationApiClient();
    const now = new Date();
    const expireTime = new Date(now.getTime() + LEASE_DURATION_SECONDS * 1000);

    const lease = {
      apiVersion: "coordination.k8s.io/v1",
      kind: "Lease",
      metadata: {
        name: LOCK_NAME,
        namespace: LOCK_NAMESPACE,
      },
      spec: {
        holderIdentity: `${process.env.HOSTNAME || "kubekuma"}-${Date.now()}`,
        leaseDurationSeconds: LEASE_DURATION_SECONDS,
        acquireTime: now.toISOString(),
        renewTime: now.toISOString(),
        leaseTransitions: 0,
      },
    };

    // Try to get existing lease
    try {
      const existing = await client.readNamespacedLease(LOCK_NAME, LOCK_NAMESPACE);

      // Check if lease is still valid
      const renewTime = new Date(existing.spec.renewTime);
      if (renewTime.getTime() > now.getTime()) {
        logger.warn(
          { holder: existing.spec.holderIdentity },
          "Lease held by another instance"
        );
        return false;
      }

      // Lease expired, take it
      lease.metadata.resourceVersion = existing.metadata.resourceVersion;
      const updated = await client.patchNamespacedLease(
        LOCK_NAME,
        LOCK_NAMESPACE,
        lease,
        undefined,
        undefined,
        undefined,
        { headers: { "Content-Type": "application/merge-patch+json" } }
      );

      lockState.lease = updated;
      lockState.held = true;
      logger.info("Acquired scheduler lock");
      return true;
    } catch (error) {
      // Lease doesn't exist, create it
      const created = await client.createNamespacedLease(LOCK_NAMESPACE, lease);
      lockState.lease = created;
      lockState.held = true;
      logger.info("Created and acquired scheduler lock");
      return true;
    }
  } catch (error) {
    logger.error({ error }, "Failed to acquire lock");
    return false;
  }
}

/**
 * Release the singleton lock
 */
export async function releaseLock(): Promise<void> {
  if (!lockState.held) return;

  // Stop renewal interval
  if (lockState.renewInterval) {
    clearInterval(lockState.renewInterval);
    lockState.renewInterval = null;
  }

  try {
    const client = getCoordinationApiClient();
    await client.deleteNamespacedLease(LOCK_NAME, LOCK_NAMESPACE);
    lockState.held = false;
    logger.info("Released scheduler lock");
  } catch (error) {
    logger.warn({ error }, "Failed to release lock");
  }
}

/**
 * Check if lock is currently held
 */
export function isLocked(): boolean {
  return lockState.held;
}

/**
 * Start automatic lock renewal
 */
export function startLockRenewal(): void {
  if (lockState.renewInterval) return;

  lockState.renewInterval = setInterval(async () => {
    if (!lockState.held || !lockState.lease) return;

    try {
      const client = getCoordinationApiClient();
      const now = new Date();

      const updated = {
        ...lockState.lease,
        spec: {
          ...lockState.lease.spec,
          renewTime: now.toISOString(),
        },
      };

      const lease = await client.patchNamespacedLease(
        LOCK_NAME,
        LOCK_NAMESPACE,
        updated,
        undefined,
        undefined,
        undefined,
        { headers: { "Content-Type": "application/merge-patch+json" } }
      );

      lockState.lease = lease;
    } catch (error) {
      logger.error({ error }, "Failed to renew lock, scheduler may stop");
      lockState.held = false;
      clearInterval(lockState.renewInterval!);
      lockState.renewInterval = null;
    }
  }, RENEW_INTERVAL_MS);
}

/**
 * Stop automatic lock renewal
 */
export function stopLockRenewal(): void {
  if (lockState.renewInterval) {
    clearInterval(lockState.renewInterval);
    lockState.renewInterval = null;
  }
}
