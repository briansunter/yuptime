/**
 * E2E Mock Server
 *
 * Provides HTTP, TCP, WebSocket, and gRPC endpoints for E2E testing.
 * Runs on host machine and is accessible from Kubernetes pods.
 */

import { createMockGrpcServer } from "./grpc";
import { startHttpServer } from "./http";
import { startTcpServers } from "./tcp";
import { startWebSocketServer } from "./websocket";

const HTTP_PORT = 8080;
const WS_PORT = 8082;
const GRPC_PORT = 50151; // Match e2e/lib/config.ts

async function main() {
  // Start HTTP server (includes mock Alertmanager endpoints)
  startHttpServer(HTTP_PORT);

  // Start TCP servers on multiple ports
  startTcpServers();

  // Start WebSocket server
  startWebSocketServer(WS_PORT);

  // Start gRPC mock server
  createMockGrpcServer(GRPC_PORT);
}

main().catch((_error) => {
  process.exit(1);
});
