# AGENTS.md

This file provides guidance to Codex when working in this repository.

## Project Overview

Yuptime is a Kubernetes-native monitoring system. Configuration lives in Kubernetes Custom Resources, runtime state is written to CRD status subresources, metrics are exposed for Prometheus, and dashboards are expected to be managed externally.

The current product surface is the monitor-only system:
- `Monitor`
- `MonitorSet`
- `MaintenanceWindow`
- `Silence`
- `YuptimeSettings`

## Source Of Truth

The Timoni module is authoritative.

- Deployment config, CRD definitions, RBAC, and packaging templates live under `timoni/yuptime/`
- `timoni/yuptime/templates/crds.cue` is the source of truth for CRD manifests
- `k8s/crds.yaml`, `helm/yuptime/`, and `manifests/` are mirrors/generated artifacts and should be kept aligned from the CUE-first workflow
- Runtime parsing/validation in `src/types/crd/` should match the CUE CRD surface; if they diverge, fix the CUE template first and then align TypeScript and generated artifacts

When changing CRDs or packaging:
1. Update the relevant CUE templates in `timoni/yuptime/templates/`
2. Mirror the change into checked-in YAML or generated assets in this repo
3. Update TypeScript schemas or reconciler logic if the runtime contract changed
4. Run the validation commands that are available locally

## Tech Stack

- Runtime: Bun
- Kubernetes client: `@kubernetes/client-node`
- Metrics server: native Node HTTP server on port `3000`
- Packaging: Timoni/CUE, plus committed Helm/static mirrors
- Validation/linting: Biome + TypeScript

## Common Commands

```bash
bun install
bun run dev
bun run build
bun run start
bun run type-check
bun run lint
bun run lint:fix
bun run format
bun run test
bun run test:ci
bun run test:coverage
bun run generate:helm
bun run generate:manifests
bun run validate:generated
bun run test:e2e
```

## Runtime Architecture

`src/index.ts` starts the app in this order:
1. Config validation
2. Kubernetes controller
3. Metrics server

The controller owns:
- informer startup
- reconciler registration
- job manager startup
- job completion watcher startup

## Key Components

- `src/controller/`: controller startup, Kubernetes watches, reconcilers, and job orchestration
- `src/controller/job-manager/`: checker Job creation, jitter, and completion handling
- `src/checkers/`: monitor-type implementations
- `src/checker-executor/`: in-cluster checker Job entrypoint that reads/writes Monitor CRDs directly
- `src/alerting/`: direct Alertmanager integration
- `src/types/crd/`: runtime Zod schemas for supported CRDs
- `src/server/metrics-server.ts`: `/metrics`, `/health`, and `/ready` endpoints

## Monitor Types

Implemented monitor execution lives in `src/checkers/index.ts` and the schema enum lives in `src/types/crd/monitor.ts`.

Current enum values:
- `http`
- `tcp`
- `ping`
- `dns`
- `keyword`
- `jsonQuery`
- `xmlQuery`
- `htmlQuery`
- `websocket`
- `push`
- `steam`
- `k8s`
- `docker` (reserved placeholder, not implemented)
- `mysql`
- `postgresql`
- `redis`
- `grpc`

If you change monitor types:
1. Update the CRD template in `timoni/yuptime/templates/crds.cue`
2. Update `src/types/crd/monitor.ts`
3. Update `src/checkers/index.ts`
4. Update reconciler validation if target requirements changed
5. Sync `k8s/crds.yaml`, README examples, and committed generated artifacts

## Checker Executor

The checker executor is designed for in-cluster execution.

- CLI shape: `bun src/checker-executor/cli.ts --monitor namespace/name`
- It currently requires the in-cluster service account token at `/var/run/secrets/kubernetes.io/serviceaccount/token`
- It does not support kubeconfig fallback today

Do not document local kubeconfig-based execution unless that capability is implemented.

## File Map

- Entry point: `src/index.ts`
- Controller: `src/controller/`
- Reconcilers: `src/controller/reconcilers/`
- CRD schemas: `src/types/crd/`
- Metrics server: `src/server/metrics-server.ts`
- Packaging source: `timoni/yuptime/`
- Kubernetes YAML mirrors: `k8s/`
- Committed Helm mirror: `helm/yuptime/`
- Static manifest mirror: `manifests/`
- Docs site: `docs/`

## Notes

- The controller should only write to status subresources, never to spec
- The repo currently assumes a single active controller instance
- Prefer keeping long-form docs high-signal and avoiding stale phase/status sections that require constant maintenance
