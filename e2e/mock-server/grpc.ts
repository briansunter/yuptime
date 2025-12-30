/**
 * Mock gRPC Health Server for E2E Testing
 *
 * Implements the gRPC health checking protocol (grpc.health.v1.Health)
 * using raw HTTP/2 frames to avoid heavy gRPC dependencies.
 */

import {
  createSecureServer,
  createServer,
  type Http2Server,
  type ServerHttp2Stream,
  constants,
} from "node:http2";
import { readFileSync, existsSync } from "node:fs";

// gRPC Health Check Status (from grpc.health.v1.HealthCheckResponse.ServingStatus)
const GRPC_HEALTH_SERVING = 1;
const GRPC_HEALTH_NOT_SERVING = 2;

// Service health statuses (configurable for testing)
const serviceStatuses: Map<string, number> = new Map([
  ["", GRPC_HEALTH_SERVING], // Overall health (empty string = all services)
  ["grpc.health.v1.Health", GRPC_HEALTH_SERVING],
]);

/**
 * Create a mock gRPC health check server
 * Implements grpc.health.v1.Health/Check
 */
export function createMockGrpcServer(port: number, useTls = false): Http2Server {
  let server: Http2Server;

  const options: Record<string, unknown> = {};

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
    const contentType = headers["content-type"];

    // Verify it's a gRPC request
    if (!contentType?.startsWith("application/grpc")) {
      stream.respond({
        ":status": 415,
        "content-type": "text/plain",
      });
      stream.end("Unsupported Media Type");
      return;
    }

    // Check for gRPC health check path
    if (path === "/grpc.health.v1.Health/Check" && method === "POST") {
      handleHealthCheck(stream);
    } else if (path === "/grpc.health.v1.Health/Watch" && method === "POST") {
      // Watch is a streaming call - just return SERVING once
      handleHealthWatch(stream);
    } else {
      // Unknown method - return UNIMPLEMENTED (status 12)
      sendGrpcError(stream, 12, `Method not implemented: ${path}`);
    }
  });

  server.on("error", (err) => {
    console.error("gRPC server error:", err);
  });

  // Listen on 0.0.0.0 to accept both IPv4 and IPv6 connections
  // (grpc-js client defaults to IPv4)
  server.listen(port, "0.0.0.0", () => {
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
    // HealthCheckRequest has a single string field "service" (field number 1)
    let serviceName = "";
    if (requestData.length > 5) {
      // Skip the 5-byte gRPC header (1 byte compression flag + 4 bytes length)
      const messageData = requestData.subarray(5);
      // Simple protobuf parsing for string field 1 (wire type 2 = length-delimited)
      // Field key = (field_number << 3) | wire_type = (1 << 3) | 2 = 0x0a
      if (messageData.length >= 2 && messageData[0] === 0x0a) {
        const strLen = messageData[1];
        if (messageData.length >= 2 + strLen) {
          serviceName = messageData.subarray(2, 2 + strLen).toString("utf8");
        }
      }
    }

    // Get status for the requested service
    const status = serviceStatuses.get(serviceName) ?? GRPC_HEALTH_NOT_SERVING;

    // Create HealthCheckResponse (protobuf format)
    // Field 1 (status) = varint, field key = (1 << 3) | 0 = 0x08
    const response = Buffer.from([0x08, status]);

    // Create gRPC frame (5 byte header + response)
    const frame = Buffer.alloc(5 + response.length);
    frame[0] = 0; // No compression
    frame.writeUInt32BE(response.length, 1);
    response.copy(frame, 5);

    // For a unary call with data, we need to send:
    // 1. HEADERS frame with :status 200, content-type
    // 2. DATA frame with the response
    // 3. HEADERS frame (trailers) with grpc-status

    // Use waitForTrailers to properly send trailers after data
    stream.respond(
      {
        [constants.HTTP2_HEADER_STATUS]: 200,
        [constants.HTTP2_HEADER_CONTENT_TYPE]: "application/grpc",
      },
      { waitForTrailers: true },
    );

    // Write the response frame
    stream.write(frame);

    // Listen for wantTrailers event to send trailers
    stream.on("wantTrailers", () => {
      stream.sendTrailers({
        "grpc-status": "0",
        "grpc-message": "",
      });
    });

    stream.end();
  });

  stream.on("error", () => {
    // Ignore stream errors (client may have disconnected)
  });
}

function handleHealthWatch(stream: ServerHttp2Stream): void {
  const chunks: Buffer[] = [];

  stream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  stream.on("end", () => {
    // For Watch, just send SERVING once and close
    // (Real implementation would stream updates)
    const response = Buffer.from([0x08, GRPC_HEALTH_SERVING]);

    const frame = Buffer.alloc(5 + response.length);
    frame[0] = 0;
    frame.writeUInt32BE(response.length, 1);
    response.copy(frame, 5);

    stream.respond(
      {
        [constants.HTTP2_HEADER_STATUS]: 200,
        [constants.HTTP2_HEADER_CONTENT_TYPE]: "application/grpc",
      },
      { waitForTrailers: true },
    );

    stream.write(frame);

    stream.on("wantTrailers", () => {
      stream.sendTrailers({
        "grpc-status": "0",
        "grpc-message": "",
      });
    });

    stream.end();
  });

  stream.on("error", () => {});
}

function sendGrpcError(stream: ServerHttp2Stream, code: number, message: string): void {
  stream.respond({
    [constants.HTTP2_HEADER_STATUS]: 200,
    [constants.HTTP2_HEADER_CONTENT_TYPE]: "application/grpc",
    "grpc-status": String(code),
    "grpc-message": encodeURIComponent(message),
  });
  stream.end();
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
