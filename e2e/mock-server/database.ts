/**
 * Mock Database Servers for E2E Testing
 *
 * These are simplified mock servers that implement just enough of the
 * database protocols to test connectivity. They don't implement full
 * database functionality - just enough for health checks.
 */

import { createServer, type Server, type Socket } from "node:net";

// MySQL Protocol Constants
const MYSQL_PROTOCOL_VERSION = 10;
const MYSQL_SERVER_VERSION = "8.0.0-mock";
const MYSQL_AUTH_PLUGIN = "mysql_native_password";

// PostgreSQL Protocol Constants
const PG_AUTH_OK = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]); // AuthenticationOk
const PG_READY = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]); // ReadyForQuery (Idle)
const PG_COMMAND_COMPLETE = Buffer.from([0x43, 0, 0, 0, 13, 0x53, 0x45, 0x4c, 0x45, 0x43, 0x54, 0x20, 0x31, 0x00]); // CommandComplete

// Redis Protocol Constants
const REDIS_PONG = "+PONG\r\n";
const REDIS_OK = "+OK\r\n";

/**
 * Create a mock MySQL server
 * Responds to initial handshake and basic queries
 */
export function createMockMySqlServer(port: number): Server {
  const server = createServer((socket: Socket) => {
    // Send initial handshake packet
    const handshake = createMySqlHandshake();
    socket.write(handshake);

    let authenticated = false;

    socket.on("data", (data) => {
      if (!authenticated) {
        // Client auth response - send OK packet
        const okPacket = Buffer.from([
          0x07, 0x00, 0x00, 0x02, // Length + sequence
          0x00, // OK packet header
          0x00, 0x00, // affected rows
          0x00, 0x00, // last insert id
          0x02, 0x00, // status flags (autocommit)
          0x00, 0x00, // warnings
        ]);
        socket.write(okPacket);
        authenticated = true;
      } else {
        // Query - send OK or result
        const seqId = data[3];
        const okPacket = Buffer.from([
          0x07, 0x00, 0x00, (seqId + 1) & 0xff,
          0x00, // OK packet header
          0x00, 0x00, // affected rows
          0x00, 0x00, // last insert id
          0x02, 0x00, // status flags
          0x00, 0x00, // warnings
        ]);
        socket.write(okPacket);
      }
    });

    socket.on("error", () => {
      // Ignore socket errors
    });
  });

  server.listen(port, () => {
    console.log(`Mock MySQL server listening on port ${port}`);
  });

  return server;
}

function createMySqlHandshake(): Buffer {
  const serverVersion = `${MYSQL_SERVER_VERSION}\0`;
  const authPluginData = Buffer.alloc(21).fill(0x41); // Fake auth data
  const authPlugin = `${MYSQL_AUTH_PLUGIN}\0`;

  // Calculate payload size
  const payloadSize =
    1 + // protocol version
    serverVersion.length +
    4 + // connection id
    8 + // auth plugin data part 1
    1 + // filler
    2 + // capability flags lower
    1 + // character set
    2 + // status flags
    2 + // capability flags upper
    1 + // auth plugin data length
    10 + // reserved
    13 + // auth plugin data part 2
    authPlugin.length;

  const packet = Buffer.alloc(4 + payloadSize);
  let offset = 0;

  // Packet header
  packet.writeUIntLE(payloadSize, 0, 3);
  packet[3] = 0; // Sequence ID
  offset = 4;

  // Protocol version
  packet[offset++] = MYSQL_PROTOCOL_VERSION;

  // Server version
  packet.write(serverVersion, offset);
  offset += serverVersion.length;

  // Connection ID
  packet.writeUInt32LE(1, offset);
  offset += 4;

  // Auth plugin data part 1
  authPluginData.copy(packet, offset, 0, 8);
  offset += 8;

  // Filler
  packet[offset++] = 0;

  // Capability flags (lower)
  packet.writeUInt16LE(0xf7ff, offset);
  offset += 2;

  // Character set
  packet[offset++] = 33; // utf8

  // Status flags
  packet.writeUInt16LE(2, offset);
  offset += 2;

  // Capability flags (upper)
  packet.writeUInt16LE(0x81ff, offset);
  offset += 2;

  // Auth plugin data length
  packet[offset++] = 21;

  // Reserved
  offset += 10;

  // Auth plugin data part 2
  authPluginData.copy(packet, offset, 8, 21);
  offset += 13;

  // Auth plugin name
  packet.write(authPlugin, offset);

  return packet;
}

/**
 * Create a mock PostgreSQL server
 * Responds to startup and basic queries
 */
export function createMockPostgreSqlServer(port: number): Server {
  const server = createServer((socket: Socket) => {
    let startupReceived = false;

    socket.on("data", (data) => {
      if (!startupReceived) {
        // Check for SSL request (8 bytes, value 80877103)
        if (data.length === 8) {
          const code = data.readInt32BE(4);
          if (code === 80877103) {
            // SSL not supported
            socket.write(Buffer.from([0x4e])); // 'N' = no SSL
            return;
          }
        }

        // Startup message - send AuthOk and ReadyForQuery
        socket.write(PG_AUTH_OK);
        socket.write(PG_READY);
        startupReceived = true;
      } else {
        // Query message
        const msgType = data[0];
        if (msgType === 0x51) {
          // 'Q' = Query
          // Send CommandComplete and ReadyForQuery
          socket.write(PG_COMMAND_COMPLETE);
          socket.write(PG_READY);
        } else if (msgType === 0x58) {
          // 'X' = Terminate
          socket.end();
        }
      }
    });

    socket.on("error", () => {
      // Ignore socket errors
    });
  });

  server.listen(port, () => {
    console.log(`Mock PostgreSQL server listening on port ${port}`);
  });

  return server;
}

/**
 * Create a mock Redis server
 * Responds to PING and basic commands
 */
export function createMockRedisServer(port: number): Server {
  const server = createServer((socket: Socket) => {
    socket.on("data", (data) => {
      const command = data.toString().toUpperCase();

      if (command.includes("PING")) {
        socket.write(REDIS_PONG);
      } else if (command.includes("AUTH")) {
        socket.write(REDIS_OK);
      } else if (command.includes("SELECT")) {
        socket.write(REDIS_OK);
      } else if (command.includes("QUIT")) {
        socket.write(REDIS_OK);
        socket.end();
      } else {
        // Unknown command - send OK anyway for health checks
        socket.write(REDIS_OK);
      }
    });

    socket.on("error", () => {
      // Ignore socket errors
    });
  });

  server.listen(port, () => {
    console.log(`Mock Redis server listening on port ${port}`);
  });

  return server;
}

/**
 * Start all database mock servers
 */
export function startDatabaseServers(ports: {
  mysql?: number;
  postgresql?: number;
  redis?: number;
}): { mysql?: Server; postgresql?: Server; redis?: Server } {
  const servers: { mysql?: Server; postgresql?: Server; redis?: Server } = {};

  if (ports.mysql) {
    servers.mysql = createMockMySqlServer(ports.mysql);
  }
  if (ports.postgresql) {
    servers.postgresql = createMockPostgreSqlServer(ports.postgresql);
  }
  if (ports.redis) {
    servers.redis = createMockRedisServer(ports.redis);
  }

  return servers;
}
