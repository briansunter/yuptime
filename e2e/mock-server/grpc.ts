/**
 * Mock gRPC Health Server for E2E Testing
 *
 * Implements the gRPC health checking protocol (grpc.health.v1.Health)
 * using raw HTTP/2 frames to avoid heavy gRPC dependencies.
 */

import { createSecureServer, createServer, type Http2Server, type ServerHttp2Stream } from "node:http2";
import { readFileSync, existsSync } from "node:fs";

// gRPC Health Check Status
const GRPC_HEALTH_SERVING = 1;
const GRPC_HEALTH_NOT_SERVING = 2;

// Service health statuses (configurable for testing)
const serviceStatuses: Map<string, number> = new Map([
  ["", GRPC_HEALTH_SERVING], // Overall health
  ["grpc.health.v1.Health", GRPC_HEALTH_SERVING],
]);

/**
 * Create a mock gRPC health check server
 * Implements grpc.health.v1.Health/Check
 */
export function createMockGrpcServer(port: number, useTls = false): Http2Server {
  let server: Http2Server;

  const options: Record<string, unknown> = {
    settings: {
      enableConnectProtocol: false,
    },
  };

  if (useTls) {
    const certPath = process.env.GRPC_TLS_CERT || "/tmp/grpc-cert.pem";
    const keyPath = process.env.GRPC_TLS_KEY || "/tmp/grpc-key.pem";

    if (existsSync(certPath) && existsSync(keyPath)) {
      options.cert = readFileSync(certPath);
      options.key = readFileSync(keyPath);
      server = createSecureServer(options);
    } else {
      console.warn("TLS certificates not found, falling back to insecure server");
      server = createServer(options);
    }
  } else {
    server = createServer(options);
  }

  server.on("stream", (stream: ServerHttp2Stream, headers: Record<string, string>) => {
    const path = headers[":path"];
    const method = headers[":method"];

    // Check for gRPC health check path
    if (path === "/grpc.health.v1.Health/Check" && method === "POST") {
      handleHealthCheck(stream);
    } else {
      // Unknown method - return UNIMPLEMENTED
      stream.respond({
        ":status": 200,
        "content-type": "application/grpc",
        "grpc-status": "12", // UNIMPLEMENTED
        "grpc-message": "Method not found",
      });
      stream.end();
    }
  });

  server.on("error", (err) => {
    console.error("gRPC server error:", err);
  });

  server.listen(port, () => {
    console.log(`Mock gRPC server listening on port ${port}${useTls ? " (TLS)" : ""}`);
  });

  return server;
}

function handleHealthCheck(stream: ServerHttp2Stream): void {
  const chunks: Buffer[] = [];

  stream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  stream.on("end", () => {
    const requestData = Buffer.concat(chunks);

    // Parse the service name from the request (protobuf format)
    // HealthCheckRequest has a single string field "service"
    let serviceName = "";
    if (requestData.length > 5) {
      // Skip the 5-byte gRPC header (compression flag + 4 bytes length)
      const messageData = requestData.subarray(5);
      // Simple protobuf parsing for string field 1
      if (messageData.length > 2 && messageData[0] === 0x0a) {
        const strLen = messageData[1];
        serviceName = messageData.subarray(2, 2 + strLen).toString();
      }
    }

    // Get status for the requested service
    const status = serviceStatuses.get(serviceName) ?? GRPC_HEALTH_NOT_SERVING;

    // Create HealthCheckResponse (protobuf format)
    // Field 1 (status) = varint
    const response = Buffer.from([0x08, status]);

    // Create gRPC frame (5 byte header + response)
    const frame = Buffer.alloc(5 + response.length);
    frame[0] = 0; // No compression
    frame.writeUInt32BE(response.length, 1);
    response.copy(frame, 5);

    stream.respond({
      ":status": 200,
      "content-type": "application/grpc",
    });

    stream.write(frame);

    // Send trailers with gRPC status
    stream.end(undefined, undefined, () => {
      // Note: http2 stream.end doesn't support trailers the same way
      // The client should interpret the response correctly
    });
  });

  stream.on("error", () => {
    // Ignore stream errors
  });
}

/**
 * Set the health status for a service (for testing different scenarios)
 */
export function setServiceStatus(service: string, status: number): void {
  serviceStatuses.set(service, status);
}

/**
 * Reset all service statuses to healthy
 */
export function resetServiceStatuses(): void {
  serviceStatuses.clear();
  serviceStatuses.set("", GRPC_HEALTH_SERVING);
  serviceStatuses.set("grpc.health.v1.Health", GRPC_HEALTH_SERVING);
}
