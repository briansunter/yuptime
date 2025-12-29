/**
 * Schema Registry
 *
 * Central registry for all CRD Zod schemas.
 * Provides type-safe parsing and validation of Kubernetes resources.
 *
 * Usage:
 *   import { parseResource, CRD_KINDS, type AnyCRD } from './schema-registry';
 *   import { MonitorSchema } from '../types/crd';
 *
 *   // Parse a Kubernetes API resource
 *   const monitor = MonitorSchema.parse(k8sResource);
 *
 *   // Or use the registry dynamically
 *   const resource = parseResource(k8sResource, 'Monitor');
 */

import type { z } from "zod";
import {
  MaintenanceWindowSchema,
  MonitorSchema,
  MonitorSetSchema,
  SilenceSchema,
  YuptimeSettingsSchema,
} from "../types/crd";

/**
 * All CRD kinds and their Zod schemas
 */
export const CRD_KINDS = {
  Monitor: MonitorSchema,
  MonitorSet: MonitorSetSchema,
  MaintenanceWindow: MaintenanceWindowSchema,
  Silence: SilenceSchema,
  YuptimeSettings: YuptimeSettingsSchema,
} as const;

/**
 * Union type of all CRD kind names
 */
export type CRDKind = keyof typeof CRD_KINDS;

/**
 * Union type of all CRD types (inferred from schemas)
 */
export type AnyCRD = z.infer<(typeof CRD_KINDS)[CRDKind]>;

/**
 * Parse a Kubernetes resource using its Zod schema
 *
 * @param resource - Raw resource from Kubernetes API (unknown type)
 * @param kind - CRD kind name (e.g., 'Monitor', 'Incident')
 * @returns Parsed and validated CRD object
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * const rawResource = await k8sApi.getNamespacedCustomObject(...);
 * const monitor = parseResource(rawResource, 'Monitor');
 * console.log(monitor.spec.intervalSeconds); // Fully typed!
 */
export function parseResource(resource: unknown, kind: CRDKind): AnyCRD {
  const schema = CRD_KINDS[kind];
  return schema.parse(resource);
}

/**
 * Safely parse a resource without throwing
 *
 * @param resource - Raw resource from Kubernetes API
 * @param kind - CRD kind name
 * @returns Result with success flag and typed data or error
 */
export function safeParseResource(
  resource: unknown,
  kind: CRDKind,
): z.SafeParseSuccess<AnyCRD> | z.SafeParseError<AnyCRD> {
  const schema = CRD_KINDS[kind];
  return schema.safeParse(resource);
}

/**
 * Get Zod schema for a given CRD kind
 *
 * @param kind - CRD kind name
 * @returns Zod schema for the CRD
 */
export function getSchema<K extends CRDKind>(kind: K): (typeof CRD_KINDS)[K] {
  return CRD_KINDS[kind];
}
