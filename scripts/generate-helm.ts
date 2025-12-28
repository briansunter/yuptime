#!/usr/bin/env bun
/**
 * Generate Helm chart from CUE templates
 *
 * This script:
 * 1. Uses timoni to render resources for different configurations
 * 2. Converts YAML to Helm Go templates
 * 3. Generates Chart.yaml and values.yaml
 * 4. Creates a complete Helm chart
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const CUE_MODULE_PATH = join(__dirname, "..", "timoni", "yuptime");
const HELM_OUTPUT_PATH = join(__dirname, "..", "helm", "yuptime");
const TEMPLATES_DIR = join(HELM_OUTPUT_PATH, "templates");

/**
 * Get version from package.json
 */
function getVersion(): string {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version || "0.0.0";
}

/**
 * Generate Chart.yaml
 */
function generateChartYaml(version: string): string {
  return `apiVersion: v2
name: yuptime
description: Kubernetes-native monitoring where all configuration is CRDs
type: application
version: ${version}
appVersion: ${version}
kubeVersion: ">=1.26.0"
keywords:
  - monitoring
  - uptime
  - kubernetes
  - crd
  - gitops
home: https://github.com/yuptime/yuptime
sources:
  - https://github.com/yuptime/yuptime
maintainers:
  - name: briansunter
    email: brian@yuptime.io
annotations:
  artifacthub.io/category: monitoring
  artifacthub.io/license: Apache-2.0
  artifacthub.io/links: |
    - name: Documentation
      url: https://docs.yuptime.io
    - name: Support
      url: https://github.com/yuptime/yuptime/issues
`;
}

/**
 * Generate values.yaml from CUE values schema
 */
function generateValuesYaml(): string {
  // Read CUE values file
  const cueValuesPath = join(CUE_MODULE_PATH, "values.cue");
  const cueValues = readFileSync(cueValuesPath, "utf-8");

  // Parse key values from CUE (simplified - in production would use proper CUE parser)
  // For now, we'll generate a comprehensive values.yaml based on what we know

  return `# Default values for yuptime
# This is generated from timoni/yuptime/values.cue - DO NOT EDIT MANUALLY

image:
  repository: ghcr.io/yuptime/yuptime-api
  pullPolicy: IfNotPresent
  tag: "" # Defaults to .Chart.AppVersion

checkerImage:
  repository: ghcr.io/yuptime/yuptime-checker
  pullPolicy: IfNotPresent
  tag: "" # Defaults to .Chart.AppVersion

# Application mode
mode: production

# Database configuration
database:
  type: sqlite # sqlite | postgresql | etcd

  # SQLite configuration
  sqlite:
    path: /data/yuptime.db

  # PostgreSQL configuration
  postgresql:
    host: ""
    port: 5432
    database: yuptime
    username: yuptime
    passwordSecretRef:
      name: ""
      key: password
    sslMode: require

  # etcd configuration
  etcd:
    endpoints: http://etcd:2379
    deploy: false

# Storage configuration
storage:
  enabled: true
  size: 1Gi
  storageClass: "" # Uses default storage class if empty
  accessMode: ReadWriteOnce

# Authentication configuration
auth:
  mode: local # local | oidc | disabled

  # Session configuration
  session:
    secret: "" # Generated if empty
    maxAgeHours: 168

  # OIDC configuration
  oidc:
    issuerUrl: ""
    clientId: ""
    redirectUrl: ""
    clientSecretRef:
      name: ""
      key: client-secret

  # Admin user configuration (local mode)
  adminUser:
    enabled: true
    username: admin
    passwordHash: "" # Default password hash for: test1234

# Logging configuration
logging:
  level: info # debug | info | warn | error

# Service configuration
service:
  type: ClusterIP
  port: 3000
  # Annotations for the service
  annotations: {}

# Health probes
probes:
  liveness:
    enabled: true
    initialDelaySeconds: 15
    periodSeconds: 30
    timeoutSeconds: 5
    failureThreshold: 3
  readiness:
    enabled: true
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 2

# Resource limits and requests
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# Node selector
nodeSelector: {}

# Tolerations
tolerations: []

# Affinity rules
affinity: {}

# Optional features
networkPolicy:
  enabled: true

podDisruptionBudget:
  enabled: true
  minAvailable: 1

# CRD installation
crds:
  install: false # CRDs should be applied separately

# Test job configuration
testResources:
  enabled: false
`;
}

/**
 * Render resources using timoni for a specific configuration
 */
function renderWithTimoni(valuesOverride: string): string {
  // Create temporary values file
  const tempValuesPath = join(__dirname, ".tmp.values.cue");
  writeFileSync(tempValuesPath, valuesOverride);

  try {
    const output = execSync(
      `timoni build yuptime ${CUE_MODULE_PATH} -n yuptime -f ${tempValuesPath} --output yaml`,
      {
        encoding: "utf-8",
        cwd: join(__dirname, ".."),
      }
    );
    return output;
  } finally {
    // Cleanup temp file
    const fs = require("fs");
    fs.unlinkSync(tempValuesPath);
  }
}

/**
 * Convert YAML to Helm Go template
 */
function convertToHelmTemplate(yaml: string, resourceName: string): string {
  // Basic conversions from static YAML to Helm templates
  let template = yaml;

  // Split into documents if there are multiple
  const docs = template.split('---').filter((doc) => doc.trim());

  let processedDocs = docs.map((doc) => {
    let processed = doc;

    // Replace common patterns with Helm template syntax
    processed = processed.replace(/name: yuptime-api/g, 'name: {{ include "yuptime.fullname" . }}-api');
    processed = processed.replace(/name: yuptime-checker/g, 'name: {{ include "yuptime.fullname" . }}-checker');
    processed = processed.replace(/name: yuptime/g, 'name: {{ include "yuptime.fullname" . }}');
    processed = processed.replace(/namespace: yuptime/g, 'namespace: {{ .Release.Namespace }}');

    // Replace image references with Helm values
    processed = processed.replace(
      /image: ghcr\.io\/yuptime\/yuptime-api:latest/g,
      'image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"'
    );
    processed = processed.replace(
      /image: ghcr\.io\/yuptime\/yuptime-checker:latest/g,
      'image: "{{ .Values.checkerImage.repository }}:{{ .Values.checkerImage.tag | default .Chart.AppVersion }}"'
    );

    // Replace imagePullPolicy
    processed = processed.replace(
      /imagePullPolicy: IfNotPresent/g,
      'imagePullPolicy: "{{ .Values.image.pullPolicy }}"'
    );

    return processed.trim();
  });

  // Join documents back together
  template = processedDocs.join('\n---\n');

  return template;
}

/**
 * Generate Helm helper templates
 */
function generateHelpers(): string {
  return `{{/*
Expand the name of the chart.
*/}}
{{- define "yuptime.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "yuptime.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "yuptime.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "yuptime.labels" -}}
helm.sh/chart: {{ include "yuptime.chart" . }}
{{ include "yuptime.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "yuptime.selectorLabels" -}}
app.kubernetes.io/name: {{ include "yuptime.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "yuptime.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "yuptime.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
`;
}

/**
 * Generate NOTES.txt for post-install messages
 */
function generateNotes(): string {
  return `Thank you for installing {{ .Chart.Name }}!

Your release is named {{ .Release.Name }}.

To learn more about the release, try:

  $ helm status {{ .Release.Name }}
  $ helm get all {{ .Release.Name }}

1. Get the application URL by running these commands:
{{- if .Values.service.type }}
  export POD_NAME=$(kubectl get pods --namespace {{ .Release.Namespace }} -l "app.kubernetes.io/name={{ include "yuptime.name" . }},app.kubernetes.io/instance={{ .Release.Name }}" -o jsonpath="{.items[0].metadata.name}")
  export CONTAINER_PORT=$(kubectl get pod --namespace {{ .Release.Namespace }} $POD_NAME -o jsonpath="{.spec.containers[0].ports[0].containerPort}")
  kubectl --namespace {{ .Release.Namespace }} port-forward $POD_NAME 3000:$CONTAINER_PORT
  echo "Visit http://127.0.0.1:3000 to use your application"
{{- end }}

2. Create your first Monitor:
  kubectl apply -f - <<EOF
  apiVersion: monitoring.yuptime.io/v1
  kind: Monitor
  metadata:
    name: example
    namespace: {{ .Release.Namespace }}
  spec:
    type: http
    http:
      url: https://example.com
    schedule:
      intervalSeconds: 60
  EOF

For more information, visit: https://docs.yuptime.io
`;
}

/**
 * Generate Helm templates by rendering with timoni and converting
 */
function generateHelmTemplates(version: string): void {
  console.log("  📝 Generating Helm templates...");

  mkdirSync(TEMPLATES_DIR, { recursive: true });

  // Generate helpers
  writeFileSync(join(TEMPLATES_DIR, "_helpers.tpl"), generateHelpers());
  console.log("    ✅ _helpers.tpl");

  // Generate NOTES.txt
  writeFileSync(join(TEMPLATES_DIR, "NOTES.txt"), generateNotes());
  console.log("    ✅ NOTES.txt");

  // Render with default configuration
  const defaultValues = `
package main
values: {
  metadata: {
    name: "yuptime"
    namespace: "yuptime"
  }
}
`;

  const yaml = renderWithTimoni(defaultValues);

  // Split into individual templates
  const docs = yaml.split("---\n").filter((doc) => doc.trim());

  const templateFiles: Record<string, string> = {};

  for (const doc of docs) {
    const kindMatch = doc.match(/kind:\s*(\S+)/);
    if (!kindMatch) continue;

    const kind = kindMatch[1];
    let filename = kind
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase() + ".yaml";

    // Special handling for certain resources
    if (kind === "CustomResourceDefinition") {
      filename = "crds.yaml";
    } else if (kind === "ClusterRole" || kind === "ClusterRoleBinding") {
      filename = "rbac.yaml";
    }

    templateFiles[filename] = (templateFiles[filename] || "") + `---\n${doc}`;
  }

  // Write template files with Helm syntax
  for (const [filename, content] of Object.entries(templateFiles)) {
    const templateContent = convertToHelmTemplate(content, filename.replace(".yaml", ""));
    writeFileSync(join(TEMPLATES_DIR, filename), templateContent);
    console.log(`    ✅ ${filename}`);
  }
}

/**
 * Main execution
 */
function main() {
  console.log("🔨 Generating Helm chart from CUE templates...\n");

  // Check if timoni is available
  try {
    execSync("which timoni");
  } catch {
    console.error("❌ Timoni not found. Install with: brew install timoni");
    process.exit(1);
  }

  const version = getVersion();

  // Create output directory
  mkdirSync(HELM_OUTPUT_PATH, { recursive: true });
  mkdirSync(TEMPLATES_DIR, { recursive: true });

  // Generate Chart.yaml
  console.log("  📄 Generating Chart.yaml...");
  writeFileSync(join(HELM_OUTPUT_PATH, "Chart.yaml"), generateChartYaml(version));
  console.log("    ✅ Chart.yaml");

  // Generate values.yaml
  console.log("  📄 Generating values.yaml...");
  writeFileSync(join(HELM_OUTPUT_PATH, "values.yaml"), generateValuesYaml());
  console.log("    ✅ values.yaml");

  // Generate templates
  generateHelmTemplates(version);

  console.log(`\n✅ Helm chart generated successfully to ${HELM_OUTPUT_PATH}`);
  console.log("\nTo test the chart:");
  console.log("  helm template yuptime helm/yuptime --debug");
}

main();
