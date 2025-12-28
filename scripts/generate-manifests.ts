#!/usr/bin/env bun
/**
 * Generate static YAML manifests from CUE templates
 *
 * This script uses timoni to render resources with default values
 * and outputs individual YAML files for each resource.
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const CUE_MODULE_PATH = join(__dirname, "..", "timoni", "yuptime");
const MANIFESTS_OUTPUT_PATH = join(__dirname, "..", "manifests");

interface ManifestConfig {
  name: string;
  namespace: string;
  outputFile?: string;
}

/**
 * Render manifests using timoni apply with dry-run
 */
function renderManifests(config: ManifestConfig): string {
  console.log(
    `Generating manifests for ${config.name}/${config.namespace}...`
  );

  const output = execSync(
    `timoni build yuptime ${CUE_MODULE_PATH} -n ${config.namespace} --output yaml`,
    {
      encoding: "utf-8",
      cwd: join(__dirname, ".."),
    }
  );

  return output;
}

/**
 * Split combined YAML into individual files
 */
function splitAndWriteManifests(yaml: string): void {
  const docs = yaml.split("---\n").filter((doc) => doc.trim());

  mkdirSync(MANIFESTS_OUTPUT_PATH, { recursive: true });

  const files: Record<string, string> = {};
  const resourceTypes: string[] = [];

  for (const doc of docs) {
    const kindMatch = doc.match(/kind:\s*(\S+)/);
    if (!kindMatch) continue;

    const kind = kindMatch[1];
    resourceTypes.push(kind);

    // Convert CamelCase to kebab-case
    const filename =
      kind
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase() + ".yaml";

    files[filename] = (files[filename] || "") + `---\n${doc}`;
  }

  // Write individual files
  for (const [filename, content] of Object.entries(files)) {
    const filepath = join(MANIFESTS_OUTPUT_PATH, filename);
    writeFileSync(filepath, content.trimStart() + "\n");
    console.log(`  ✅ ${filename}`);
  }

  // Write combined manifest
  writeFileSync(
    join(MANIFESTS_OUTPUT_PATH, "all.yaml"),
    yaml.trim() + "\n"
  );
  console.log(`  ✅ all.yaml (combined)`);

  // Write README
  const readme = `# Yuptime Static Manifests

This directory contains Kubernetes manifests generated from the CUE templates in \`timoni/yuptime/\`.

## Files

- \`all.yaml\` - Combined manifest with all resources
- Individual resource files for customization

## Usage

\`\`\`bash
# Apply all resources
kubectl apply -f all.yaml

# Or apply individual files
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f deployment.yaml
\`\`\`

## Generated Resources

${resourceTypes.map((kind) => `- ${kind}`).join("\n")}

## Regeneration

These manifests are auto-generated from CUE templates. Do not edit manually.

To regenerate: \`bun run generate:manifests\`
`;

  writeFileSync(join(MANIFESTS_OUTPUT_PATH, "README.md"), readme);
  console.log(`  ✅ README.md`);
}

/**
 * Main execution
 */
function main() {
  console.log("🔨 Generating static manifests from CUE templates...\n");

  // Check if timoni is available
  try {
    execSync("which timoni");
  } catch {
    console.error(
      "❌ Timoni not found. Install with: brew install timoni"
    );
    process.exit(1);
  }

  // Generate manifests
  const config: ManifestConfig = {
    name: "yuptime",
    namespace: "yuptime",
  };

  const yaml = renderManifests(config);
  splitAndWriteManifests(yaml);

  console.log(`\n✅ Static manifests generated to ${MANIFESTS_OUTPUT_PATH}`);
}

main();
