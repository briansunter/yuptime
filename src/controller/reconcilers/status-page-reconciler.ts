/**
 * StatusPage reconciler
 *
 * Manages public status pages with monitor grouping
 */

import { and, eq } from "drizzle-orm";
import { getDatabase } from "../../db";
import { crdCache } from "../../db/schema";
import { logger } from "../../lib/logger";
import { StatusPageSchema } from "../../types/crd";
import type { CRDResource, ReconcilerConfig } from "./types";
import {
  commonValidations,
  composeValidators,
  createZodValidator,
  validate,
} from "./validation";

/**
 * StatusPage validators
 */
const validateSlug = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const slug = resource.spec.slug;

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    errors.push(
      "spec.slug must contain only lowercase letters, numbers, and hyphens",
    );
  }

  if (slug === "api" || slug === "admin" || slug === "health") {
    errors.push(`spec.slug "${slug}" is reserved`);
  }

  return errors;
};

const validateGroups = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const groups = resource.spec.groups;

  if (!groups || groups.length === 0) {
    errors.push("spec.groups must have at least one group");
    return errors;
  }

  const groupNames = new Set<string>();

  for (const group of groups) {
    // Check group name
    if (!group.name) {
      errors.push("Each group must have a name");
      continue;
    }

    if (groupNames.has(group.name)) {
      errors.push(`Duplicate group name: ${group.name}`);
    }
    groupNames.add(group.name);

    // Check monitors
    if (!group.monitors || group.monitors.length === 0) {
      errors.push(`Group "${group.name}" must have at least one monitor`);
    }

    for (const monitor of group.monitors || []) {
      if (!monitor.ref?.namespace || !monitor.ref?.name) {
        errors.push(
          `Group "${group.name}": Monitor must have namespace and name`,
        );
      }
    }
  }

  return errors;
};

const validateStatusPage = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(StatusPageSchema),
  validateSlug,
  validateGroups,
);

const reconcileStatusPage = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name }, "Reconciling StatusPage");

  try {
    // Verify all referenced monitors exist
    const db = getDatabase();

    const missingMonitors: string[] = [];

    if (spec.groups && Array.isArray(spec.groups)) {
      for (const group of spec.groups) {
        for (const monitorRef of group.monitors || []) {
          const monitor = await db
            .select()
            .from(crdCache)
            .where(
              and(
                eq(crdCache.kind, "Monitor"),
                eq(crdCache.namespace, monitorRef.ref.namespace),
                eq(crdCache.name, monitorRef.ref.name),
              ),
            );

          if (!monitor || monitor.length === 0) {
            missingMonitors.push(
              `${monitorRef.ref.namespace}/${monitorRef.ref.name}`,
            );
          }
        }
      }
    }

    if (missingMonitors.length > 0) {
      logger.warn(
        { namespace, name, missingMonitors },
        "StatusPage references non-existent monitors",
      );
    }

    // Count monitors
    const monitorCount = (spec.groups || []).reduce(
      (sum, group) => sum + (group.monitors?.length || 0),
      0,
    );

    // Calculate published URL
    let publishedUrl = "";
    if (spec.published) {
      if (spec.exposure?.hosts && spec.exposure.hosts.length > 0) {
        const protocol = spec.exposure.tls ? "https" : "http";
        publishedUrl = `${protocol}://${spec.exposure.hosts[0]}/status/${spec.slug}`;
      } else {
        publishedUrl = `/status/${spec.slug}`;
      }
    }

    // Update crd_cache
    await db
      .update(crdCache)
      .set({
        status: JSON.stringify({
          state: missingMonitors.length === 0 ? "valid" : "warning",
          missingMonitors,
        }),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(crdCache.kind, "StatusPage"),
          eq(crdCache.namespace, namespace),
          eq(crdCache.name, name),
        ),
      );

    logger.info(
      {
        namespace,
        name,
        slug: spec.slug,
        monitorCount,
        published: spec.published,
        publishedUrl: publishedUrl || "not-published",
      },
      "StatusPage reconciliation complete",
    );
  } catch (error) {
    logger.error(
      { namespace, name, error },
      "StatusPage reconciliation failed",
    );
    throw error;
  }
};

/**
 * Get status page by slug
 */
export async function getStatusPageBySlug(slug: string): Promise<any | null> {
  try {
    const db = getDatabase();

    const [page] = await db
      .select()
      .from(crdCache)
      .where(eq(crdCache.name, slug));

    if (!page) {
      return null;
    }

    return JSON.parse(page.spec || "{}");
  } catch (error) {
    logger.error({ slug, error }, "Failed to get status page");
    return null;
  }
}

/**
 * List all published status pages
 */
export async function getPublishedStatusPages(): Promise<any[]> {
  try {
    const db = getDatabase();

    const pages = await db
      .select()
      .from(crdCache)
      .where(eq(crdCache.kind, "StatusPage"));

    return pages
      .map((p) => {
        const spec = JSON.parse(p.spec || "{}");
        return spec.published ? spec : null;
      })
      .filter((p) => p !== null);
  } catch (error) {
    logger.error({ error }, "Failed to list status pages");
    return [];
  }
}

export const createStatusPageReconciler = (): ReconcilerConfig => ({
  kind: "StatusPage",
  plural: "statuspages",
  zodSchema: StatusPageSchema,
  validator: validate(validateStatusPage),
  reconciler: reconcileStatusPage,
});
