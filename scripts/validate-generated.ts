#!/usr/bin/env bun
/**
 * Validate generated artifacts
 *
 * This script:
 * 1. Tests Helm chart with helm template
 * 2. Validates static manifests with kubectl dry-run
 * 3. Compares rendered output against timoni output
 */

import { execFileSync, execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CUE_MODULE_PATH = join(__dirname, "..", "timoni", "yuptime");
const HELM_OUTPUT_PATH = join(__dirname, "..", "helm", "yuptime");
const MANIFESTS_OUTPUT_PATH = join(__dirname, "..", "manifests");
const CRDS_OUTPUT_PATH = join(__dirname, "..", "k8s", "crds.yaml");

type KubernetesResource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
  };
  [key: string]: unknown;
};

type RenderScenario = {
  name: string;
  timoniValues?: string;
  helmArgs?: string[];
};

const RENDER_SCENARIOS: RenderScenario[] = [
  { name: "default" },
  {
    name: "Jobs rollback mode",
    timoniValues: 'values: execution: mode: "jobs"\n',
    helmArgs: ["--set", "execution.mode=jobs"],
  },
  {
    name: "restrictive NetworkPolicy",
    timoniValues: 'values: networkPolicy: egressMode: "commonPorts"\n',
    helmArgs: ["--set", "networkPolicy.egressMode=commonPorts"],
  },
  {
    name: "CRD installation",
    timoniValues: "values: crds: install: true\n",
    helmArgs: ["--set", "crds.install=true"],
  },
  {
    name: "production mode",
    timoniValues: 'values: mode: "production"\n',
    helmArgs: ["--set", "mode=production"],
  },
];

function renderWithTimoni(values?: string): string {
  const args = ["build", "yuptime", CUE_MODULE_PATH, "-n", "yuptime", "--output", "yaml"];
  let tempDirectory: string | undefined;

  try {
    if (values) {
      tempDirectory = mkdtempSync(join(tmpdir(), "yuptime-validate-"));
      const valuesPath = join(tempDirectory, "values.cue");
      writeFileSync(valuesPath, `package main\n${values}`);
      args.push("-f", valuesPath);
    }

    return execFileSync("timoni", args, { encoding: "utf-8" });
  } finally {
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function renderWithHelm(args: string[] = []): string {
  return execFileSync(
    "helm",
    [
      "template",
      "yuptime",
      HELM_OUTPUT_PATH,
      "-n",
      "yuptime",
      "--set",
      "image.tag=latest",
      "--set",
      "checkerImage.tag=latest",
      ...args,
    ],
    { encoding: "utf-8" },
  );
}

function parseKubernetesResources(yaml: string): KubernetesResource[] {
  const parsed = Bun.YAML.parse(yaml);
  const documents = Array.isArray(parsed) ? parsed : [parsed];

  return documents.filter(
    (document): document is KubernetesResource =>
      typeof document === "object" &&
      document !== null &&
      typeof document.apiVersion === "string" &&
      typeof document.kind === "string" &&
      typeof document.metadata === "object" &&
      document.metadata !== null &&
      typeof document.metadata.name === "string",
  );
}

function resourceKey(resource: KubernetesResource): string {
  return [
    resource.apiVersion,
    resource.kind,
    resource.metadata.namespace ?? "_cluster",
    resource.metadata.name,
  ].join("/");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function indexResources(resources: KubernetesResource[], label: string): Map<string, string> {
  const indexed = new Map<string, string>();
  for (const resource of resources) {
    const key = resourceKey(resource);
    if (indexed.has(key)) throw new Error(`${label} contains duplicate resource ${key}`);
    indexed.set(key, JSON.stringify(canonicalize(resource)));
  }
  return indexed;
}

function compareResourceSets(
  expectedYaml: string,
  actualYaml: string,
  expectedLabel: string,
  actualLabel: string,
  filter?: (resource: KubernetesResource) => boolean,
): string[] {
  const expectedResources = parseKubernetesResources(expectedYaml).filter(filter ?? (() => true));
  const actualResources = parseKubernetesResources(actualYaml).filter(filter ?? (() => true));
  const expected = indexResources(expectedResources, expectedLabel);
  const actual = indexResources(actualResources, actualLabel);
  const differences: string[] = [];

  for (const [key, expectedContent] of expected) {
    const actualContent = actual.get(key);
    if (actualContent === undefined) {
      differences.push(`${actualLabel} is missing ${key}`);
    } else if (actualContent !== expectedContent) {
      differences.push(`${actualLabel} content differs for ${key}`);
    }
  }

  for (const key of actual.keys()) {
    if (!expected.has(key)) differences.push(`${actualLabel} has extra resource ${key}`);
  }

  return differences;
}

/**
 * Validate Helm chart
 */
function validateHelmChart(): boolean {
  console.log("\n🔍 Validating Helm chart...");

  try {
    // Check if helm is available
    execSync("which helm");
  } catch {
    console.warn("⚠️  Helm not found. Skipping Helm validation.");
    return true;
  }

  try {
    // Test with default values
    console.log("  Testing with default values...");
    const defaultOutput = execSync(`helm template yuptime ${HELM_OUTPUT_PATH} --debug`, {
      encoding: "utf-8",
    });
    if (!defaultOutput.includes("src/checker-sidecar/server.ts")) {
      throw new Error("Default Helm render is missing the checker sidecar");
    }
    if (defaultOutput.includes("pods/log") || defaultOutput.includes("apiGroups:\n  - batch")) {
      throw new Error("Default sidecar render includes rollback-only RBAC");
    }
    if (!defaultOutput.includes("egress:\n  - {}")) {
      throw new Error("Default NetworkPolicy does not permit arbitrary monitor targets");
    }
    console.log("  ✅ Default values");

    console.log("  Testing restrictive NetworkPolicy opt-in...");
    const commonPortsOutput = execSync(
      `helm template yuptime ${HELM_OUTPUT_PATH} --set networkPolicy.egressMode=commonPorts`,
      { encoding: "utf-8" },
    );
    if (
      !commonPortsOutput.includes("port: 3306") ||
      commonPortsOutput.includes("egress:\n  - {}")
    ) {
      throw new Error("commonPorts NetworkPolicy did not render its port allowlist");
    }
    console.log("  ✅ restrictive NetworkPolicy opt-in");

    console.log("  Testing Jobs rollback mode...");
    const jobsOutput = execSync(
      `helm template yuptime ${HELM_OUTPUT_PATH} --set execution.mode=jobs`,
      { encoding: "utf-8" },
    );
    if (jobsOutput.includes("src/checker-sidecar/server.ts")) {
      throw new Error("Jobs rollback render still includes the checker sidecar");
    }
    for (const expected of ["apiGroups:\n  - batch", "pods/log", "name: yuptime-checker"]) {
      if (!jobsOutput.includes(expected))
        throw new Error(`Jobs rollback render is missing ${expected}`);
    }
    console.log("  ✅ Jobs rollback mode");

    // Test with CRD installation enabled
    console.log("  Testing with CRD installation enabled...");
    const crdOutput = execSync(
      `helm template yuptime ${HELM_OUTPUT_PATH} --set crds.install=true`,
      { encoding: "utf-8" },
    );
    for (const expected of ["executionId:", "scheduledAt:", "startedAt:"]) {
      if (!crdOutput.includes(expected)) throw new Error(`CRD render is missing ${expected}`);
    }
    console.log("  ✅ CRD installation");

    // Test production mode toggle
    console.log("  Testing production mode...");
    execSync(`helm template yuptime ${HELM_OUTPUT_PATH} --set mode=production`, { stdio: "pipe" });
    console.log("  ✅ production mode");

    console.log("✅ Helm chart validation passed\n");
    return true;
  } catch (error: any) {
    console.error("❌ Helm chart validation failed:");
    console.error(error.stdout?.toString() || error.message);
    return false;
  }
}

/**
 * Validate static manifests
 */
function validateStaticManifests(defaultTimoniOutput: string, crdTimoniOutput: string): boolean {
  console.log("🔍 Validating static manifests...");

  try {
    const manifestDifferences = compareResourceSets(
      defaultTimoniOutput,
      readFileSync(join(MANIFESTS_OUTPUT_PATH, "all.yaml"), "utf-8"),
      "Timoni default render",
      "manifests/all.yaml",
    );
    const crdDifferences = compareResourceSets(
      crdTimoniOutput,
      readFileSync(CRDS_OUTPUT_PATH, "utf-8"),
      "Timoni CRD render",
      "k8s/crds.yaml",
      (resource) => resource.kind === "CustomResourceDefinition",
    );
    const differences = [...manifestDifferences, ...crdDifferences];

    if (differences.length > 0) {
      console.error("❌ Static manifest drift detected:");
      differences.forEach((difference) => console.error(`  - ${difference}`));
      return false;
    }

    console.log("✅ Static manifests and CRDs match Timoni content\n");
    return true;
  } catch (error) {
    console.error("❌ Static manifest validation failed:");
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Compare timoni output with Helm output
 */
function compareWithTimoni(
  renderedTimoni: Map<string, string>,
  renderedHelm: Map<string, string>,
): boolean {
  console.log("🔍 Comparing complete Helm resources with Timoni...");

  try {
    const differences: string[] = [];
    for (const scenario of RENDER_SCENARIOS) {
      const timoniOutput = renderedTimoni.get(scenario.name);
      const helmOutput = renderedHelm.get(scenario.name);
      if (!timoniOutput || !helmOutput) throw new Error(`Missing render for ${scenario.name}`);

      const scenarioDifferences = compareResourceSets(
        timoniOutput,
        helmOutput,
        `Timoni ${scenario.name}`,
        `Helm ${scenario.name}`,
      );
      differences.push(
        ...scenarioDifferences.map((difference) => `${scenario.name}: ${difference}`),
      );
      console.log(`  ${scenario.name}: ${parseKubernetesResources(timoniOutput).length} resources`);
    }

    if (differences.length > 0) {
      console.error("❌ Differences detected:");
      differences.forEach((diff) => console.error(`  - ${diff}`));
      return false;
    }

    console.log("✅ Output comparison passed\n");
    return true;
  } catch (error: any) {
    console.error("❌ Comparison failed:");
    console.error(error.message);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  console.log("🧪 Validating generated artifacts...\n");

  const renderedTimoni = new Map<string, string>();
  const renderedHelm = new Map<string, string>();
  for (const scenario of RENDER_SCENARIOS) {
    renderedTimoni.set(scenario.name, renderWithTimoni(scenario.timoniValues));
    renderedHelm.set(scenario.name, renderWithHelm(scenario.helmArgs));
  }

  const helmValid = validateHelmChart();
  const manifestsValid = validateStaticManifests(
    renderedTimoni.get("default")!,
    renderedTimoni.get("CRD installation")!,
  );
  const comparisonValid = compareWithTimoni(renderedTimoni, renderedHelm);

  if (!helmValid || !manifestsValid || !comparisonValid) {
    console.error("\n❌ Validation failed!");
    process.exit(1);
  }

  console.log("✅ All validation checks passed!");
}

main();
