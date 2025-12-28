#!/usr/bin/env bun
/**
 * Validate generated artifacts
 *
 * This script:
 * 1. Tests Helm chart with helm template
 * 2. Validates static manifests with kubectl dry-run
 * 3. Compares rendered output against timoni output
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CUE_MODULE_PATH = join(__dirname, "..", "timoni", "yuptime");
const HELM_OUTPUT_PATH = join(__dirname, "..", "helm", "yuptime");
const MANIFESTS_OUTPUT_PATH = join(__dirname, "..", "manifests");

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
    execSync(`helm template yuptime ${HELM_OUTPUT_PATH} --debug`, {
      stdio: "pipe",
    });
    console.log("  ✅ Default values");

    // Test with PostgreSQL
    console.log("  Testing with PostgreSQL...");
    execSync(
      `helm template yuptime ${HELM_OUTPUT_PATH} --set database.type=postgresql`,
      { stdio: "pipe" }
    );
    console.log("  ✅ PostgreSQL");

    // Test with etcd
    console.log("  Testing with etcd...");
    execSync(
      `helm template yuptime ${HELM_OUTPUT_PATH} --set database.type=etcd --set database.etcd.deploy=true`,
      { stdio: "pipe" }
    );
    console.log("  ✅ etcd");

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
function validateStaticManifests(): boolean {
  console.log("🔍 Validating static manifests...");

  try {
    // Check if kubectl is available
    execSync("which kubectl");
  } catch {
    console.warn("⚠️  kubectl not found. Skipping manifest validation.");
    return true;
  }

  try {
    const allYaml = join(MANIFESTS_OUTPUT_PATH, "all.yaml");
    // Set KUBECONFIG to empty to prevent kubectl from using default config
    // Use --validate=false to do syntax-only validation without cluster
    execSync(
      `KUBECONFIG=/dev/null kubectl apply -f ${allYaml} --dry-run=client --validate=false`,
      {
        stdio: "pipe",
      }
    );
    console.log("✅ Static manifests validation passed\n");
    return true;
  } catch (error: any) {
    const errorMsg = error.stdout?.toString() || error.stderr?.toString() || error.message || "";
    console.error("❌ Static manifests validation failed:");
    console.error(errorMsg);
    return false;
  }
}

/**
 * Parse Kubernetes resources from YAML
 */
function parseKubernetesResources(yaml: string): any[] {
  const docs = yaml.split("---").map((doc: string) => {
    const lines = doc.split("\n").filter((line: string) => line.trim());
    const kind = lines.find((l: string) => l.startsWith("kind:"))?.split(": ")[1];
    const metadata = lines.find((l: string) => l.startsWith("  name:"))?.split(": ")[1];
    const namespace = lines.find((l: string) => l.startsWith("  namespace:"))?.split(": ")[1];

    return {
      kind,
      name: metadata,
      namespace,
      doc,
    };
  });

  return docs.filter((r: any) => r.kind);
}

/**
 * Compare resources
 */
function compareResources(timoni: any[], helm: any[]): string[] {
  const differences: string[] = [];

  // Check for missing resources
  for (const t of timoni) {
    const h = helm.find(
      (r: any) => r.kind === t.kind && r.name === t.name && r.namespace === t.namespace
    );
    if (!h) {
      differences.push(`Missing resource: ${t.kind}/${t.name} (namespace: ${t.namespace || "default"})`);
    }
  }

  // Check for extra resources
  for (const h of helm) {
    const t = timoni.find(
      (r: any) => r.kind === h.kind && r.name === h.name && r.namespace === h.namespace
    );
    if (!t) {
      differences.push(`Extra resource: ${h.kind}/${h.name} (namespace: ${h.namespace || "default"})`);
    }
  }

  return differences;
}

/**
 * Compare timoni output with Helm output
 */
function compareWithTimoni(): boolean {
  console.log("🔍 Comparing Helm output with timoni output...");

  try {
    // Render with timoni
    console.log("  Rendering with timoni...");
    const timoniOutput = execSync(
      `timoni build yuptime ${CUE_MODULE_PATH} -n yuptime --output yaml`,
      { encoding: "utf-8" }
    );

    // Render with Helm
    console.log("  Rendering with Helm...");
    const helmOutput = execSync(`helm template yuptime ${HELM_OUTPUT_PATH} -n yuptime`, {
      encoding: "utf-8",
    });

    // Parse resources
    const timoniResources = parseKubernetesResources(timoniOutput);
    const helmResources = parseKubernetesResources(helmOutput);

    console.log(`  Timoni: ${timoniResources.length} resources`);
    console.log(`  Helm: ${helmResources.length} resources`);

    // Compare
    const differences = compareResources(timoniResources, helmResources);

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

  const helmValid = validateHelmChart();
  const manifestsValid = validateStaticManifests();
  const comparisonValid = compareWithTimoni();

  if (!helmValid || !manifestsValid || !comparisonValid) {
    console.error("\n❌ Validation failed!");
    process.exit(1);
  }

  console.log("✅ All validation checks passed!");
}

main();
