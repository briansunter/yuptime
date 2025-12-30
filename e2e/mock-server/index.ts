/**
 * E2E Mock Server
 *
 * Provides HTTP, TCP, WebSocket, and database endpoints for E2E testing.
 * Runs on host machine and is accessible from Kubernetes pods.
 */

import { startDatabaseServers } from "./database";
import { createMockGrpcServer } from "./grpc";
import { startHttpServer } from "./http";
import { startTcpServers } from "./tcp";
import { startWebSocketServer } from "./websocket";

const HTTP_PORT = 8080;
const WS_PORT = 8082;
const MYSQL_PORT = 3306;
const POSTGRESQL_PORT = 5432;
const REDIS_PORT = 6379;
const GRPC_PORT = 50051;

async function main() {
  // Start HTTP server (includes mock Alertmanager endpoints)
  startHttpServer(HTTP_PORT);

  // Start TCP servers on multiple ports
  startTcpServers();

  // Start WebSocket server
  startWebSocketServer(WS_PORT);

  // Start database mock servers
  startDatabaseServers({
    mysql: MYSQL_PORT,
    postgresql: POSTGRESQL_PORT,
    redis: REDIS_PORT,
  });

  // Start gRPC mock server
  createMockGrpcServer(GRPC_PORT);
}

main().catch((_error) => {
  process.exit(1);
});
