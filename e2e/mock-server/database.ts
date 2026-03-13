/**
 * Mock Database Servers for E2E Testing
 *
 * These implement just enough of the database wire protocols for mysql2, pg,
 * and node-redis v4 client libraries to complete health checks (connect + simple query).
 */

import { createServer, type Server, type Socket } from "node:net";

// MySQL Protocol Constants
const MYSQL_PROTOCOL_VERSION = 10;
const MYSQL_SERVER_VERSION = "8.0.0-mock";
const MYSQL_AUTH_PLUGIN = "mysql_native_password";

// MySQL command types
const COM_QUIT = 0x01;
const COM_QUERY = 0x03;
const COM_STMT_PREPARE = 0x16;
const COM_STMT_EXECUTE = 0x17;
const COM_STMT_CLOSE = 0x19;

// Reusable column definition for SELECT 1
const MYSQL_COL_DEF = Buffer.from([
  0x03,
  0x64,
  0x65,
  0x66, // "def"
  0x00, // schema (empty)
  0x00, // table (empty)
  0x00, // org_table (empty)
  0x01,
  0x31, // name: "1"
  0x00, // org_name (empty)
  0x0c, // fixed length fields
  0x3f,
  0x00, // charset: binary
  0x01,
  0x00,
  0x00,
  0x00, // column length: 1
  0x08, // type: LONGLONG
  0x81,
  0x00, // flags: NOT_NULL | BINARY
  0x00, // decimals
  0x00,
  0x00, // filler
]);

function mysqlPacket(seq: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header[3] = seq & 0xff;
  return Buffer.concat([header, payload]);
}

function mysqlOkPacket(seq: number): Buffer {
  return mysqlPacket(
    seq,
    Buffer.from([
      0x00, // OK header
      0x00, // affected rows
      0x00, // last insert id
      0x02,
      0x00, // status flags (autocommit)
      0x00,
      0x00, // warnings
    ]),
  );
}

function mysqlEofPacket(seq: number): Buffer {
  return mysqlPacket(seq, Buffer.from([0xfe, 0x00, 0x00, 0x02, 0x00]));
}

function mysqlColumnDefPacket(seq: number): Buffer {
  return mysqlPacket(seq, MYSQL_COL_DEF);
}

/**
 * Send a text protocol result set for SELECT 1 (used by COM_QUERY)
 */
function mysqlTextResultSet(socket: Socket, startSeq: number): void {
  let seq = startSeq;

  // Column count: 1
  socket.write(mysqlPacket(seq, Buffer.from([0x01])));
  seq = (seq + 1) & 0xff;

  // Column definition
  socket.write(mysqlColumnDefPacket(seq));
  seq = (seq + 1) & 0xff;

  // EOF (end of column definitions)
  socket.write(mysqlEofPacket(seq));
  seq = (seq + 1) & 0xff;

  // Row: "1" (length-encoded string: 0x01 = length, 0x31 = "1")
  socket.write(mysqlPacket(seq, Buffer.from([0x01, 0x31])));
  seq = (seq + 1) & 0xff;

  // EOF (end of rows)
  socket.write(mysqlEofPacket(seq));
}

/**
 * Send COM_STMT_PREPARE_OK response for SELECT 1
 */
function mysqlPrepareOk(socket: Socket, startSeq: number, stmtId: number): void {
  let seq = startSeq;

  // COM_STMT_PREPARE_OK
  const payload = Buffer.alloc(12);
  payload[0] = 0x00; // status OK
  payload.writeUInt32LE(stmtId, 1); // statement_id
  payload.writeUInt16LE(1, 5); // num_columns
  payload.writeUInt16LE(0, 7); // num_params
  payload[9] = 0x00; // filler
  payload.writeUInt16LE(0, 10); // warning_count
  socket.write(mysqlPacket(seq, payload));
  seq = (seq + 1) & 0xff;

  // Column definition (since num_columns = 1)
  socket.write(mysqlColumnDefPacket(seq));
  seq = (seq + 1) & 0xff;

  // EOF (end of column definitions)
  socket.write(mysqlEofPacket(seq));
}

/**
 * Send binary protocol result set for COM_STMT_EXECUTE (SELECT 1)
 */
function mysqlBinaryResultSet(socket: Socket, startSeq: number): void {
  let seq = startSeq;

  // Column count: 1
  socket.write(mysqlPacket(seq, Buffer.from([0x01])));
  seq = (seq + 1) & 0xff;

  // Column definition
  socket.write(mysqlColumnDefPacket(seq));
  seq = (seq + 1) & 0xff;

  // EOF (end of column definitions)
  socket.write(mysqlEofPacket(seq));
  seq = (seq + 1) & 0xff;

  // Binary row: header(0x00) + null_bitmap(1 byte) + int64 value
  const row = Buffer.alloc(10);
  row[0] = 0x00; // binary row packet header
  row[1] = 0x00; // null bitmap: ceil((1+2)/8) = 1 byte, no nulls
  row.writeBigInt64LE(1n, 2); // int64 value = 1
  socket.write(mysqlPacket(seq, row));
  seq = (seq + 1) & 0xff;

  // EOF (end of rows)
  socket.write(mysqlEofPacket(seq));
}

/**
 * Create a mock MySQL server
 * Handles mysql2/promise with both query() and execute() (prepared statements)
 */
export function createMockMySqlServer(port: number): Server {
  let nextStmtId = 1;

  const server = createServer((socket: Socket) => {
    // Send initial handshake
    socket.write(createMySqlHandshake());

    let authenticated = false;

    socket.on("data", (data) => {
      if (!authenticated) {
        // Client handshake response → send OK
        const clientSeqId = data[3] ?? 1;
        socket.write(mysqlOkPacket((clientSeqId + 1) & 0xff));
        authenticated = true;
        return;
      }

      // Authenticated: handle MySQL commands
      const clientSeqId = data[3] ?? 0;
      const cmdType = data[4];
      const nextSeq = (clientSeqId + 1) & 0xff;

      switch (cmdType) {
        case COM_QUIT:
          socket.end();
          break;

        case COM_QUERY: {
          // Check if it's a SELECT → result set, otherwise → OK
          const queryStr = data.subarray(5).toString("utf8").toUpperCase();
          if (queryStr.startsWith("SELECT")) {
            mysqlTextResultSet(socket, nextSeq);
          } else {
            socket.write(mysqlOkPacket(nextSeq));
          }
          break;
        }

        case COM_STMT_PREPARE: {
          const stmtId = nextStmtId++;
          mysqlPrepareOk(socket, nextSeq, stmtId);
          break;
        }

        case COM_STMT_EXECUTE:
          mysqlBinaryResultSet(socket, nextSeq);
          break;

        case COM_STMT_CLOSE:
          // No response for COM_STMT_CLOSE
          break;

        default:
          // Unknown command → OK
          socket.write(mysqlOkPacket(nextSeq));
          break;
      }
    });

    socket.on("error", () => {
      // Ignore socket errors
    });
  });

  server.listen(port, () => {
    // biome-ignore lint/suspicious/noConsole: server startup logging
    console.log(`Mock MySQL server listening on port ${port}`);
  });

  return server;
}

function createMySqlHandshake(): Buffer {
  const serverVersion = `${MYSQL_SERVER_VERSION}\0`;
  const authPluginData = Buffer.alloc(21).fill(0x41); // Fake auth data
  const authPlugin = `${MYSQL_AUTH_PLUGIN}\0`;

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

  // Capability flags (lower) - standard capabilities
  packet.writeUInt16LE(0xf7ff, offset);
  offset += 2;

  // Character set: utf8
  packet[offset++] = 33;

  // Status flags: autocommit
  packet.writeUInt16LE(2, offset);
  offset += 2;

  // Capability flags (upper) - no CLIENT_DEPRECATE_EOF (use traditional EOF markers)
  packet.writeUInt16LE(0x80ff, offset);
  offset += 2;

  // Auth plugin data length
  packet[offset++] = 21;

  // Reserved (10 zero bytes)
  offset += 10;

  // Auth plugin data part 2
  authPluginData.copy(packet, offset, 8, 21);
  offset += 13;

  // Auth plugin name
  packet.write(authPlugin, offset);

  return packet;
}

// ─── PostgreSQL Mock ───────────────────────────────────────────────────────────

function pgMessage(type: number, payload: Buffer): Buffer {
  const msg = Buffer.alloc(1 + 4 + payload.length);
  msg[0] = type;
  msg.writeInt32BE(4 + payload.length, 1);
  payload.copy(msg, 5);
  return msg;
}

// AuthenticationOk
const PG_AUTH_OK = pgMessage(0x52, Buffer.from([0x00, 0x00, 0x00, 0x00]));

// ReadyForQuery (Idle)
const PG_READY = pgMessage(0x5a, Buffer.from([0x49]));

/**
 * Build RowDescription for SELECT 1: one column named "?column?" of type int4
 */
function pgRowDescription(): Buffer {
  const colName = Buffer.from("?column?\0");
  const payload = Buffer.alloc(2 + colName.length + 4 + 2 + 4 + 2 + 4 + 2);
  let off = 0;

  // Number of fields
  payload.writeInt16BE(1, off);
  off += 2;

  // Column name
  colName.copy(payload, off);
  off += colName.length;

  // Table OID
  payload.writeInt32BE(0, off);
  off += 4;

  // Column number
  payload.writeInt16BE(0, off);
  off += 2;

  // Type OID: int4 = 23
  payload.writeInt32BE(23, off);
  off += 4;

  // Type size: 4 bytes
  payload.writeInt16BE(4, off);
  off += 2;

  // Type modifier: -1
  payload.writeInt32BE(-1, off);
  off += 4;

  // Format code: 0 = text
  payload.writeInt16BE(0, off);

  return pgMessage(0x54, payload); // 'T'
}

/**
 * Build DataRow for value "1"
 */
function pgDataRow(): Buffer {
  const value = Buffer.from("1");
  const payload = Buffer.alloc(2 + 4 + value.length);

  // Number of columns
  payload.writeInt16BE(1, 0);

  // Column value length
  payload.writeInt32BE(value.length, 2);

  // Column value
  value.copy(payload, 6);

  return pgMessage(0x44, payload); // 'D'
}

/**
 * Build CommandComplete for "SELECT 1"
 */
function pgCommandComplete(): Buffer {
  const tag = Buffer.from("SELECT 1\0");
  return pgMessage(0x43, tag); // 'C'
}

/**
 * Check if data is an SSL request (8 bytes, protocol code 80877103)
 */
function isPgSslRequest(data: Buffer): boolean {
  return data.length === 8 && data.readInt32BE(4) === 80877103;
}

/**
 * Handle authenticated PG messages from a buffer (may contain multiple messages)
 * Returns true if connection should be terminated.
 */
function handlePgMessages(
  socket: Socket,
  data: Buffer,
  responses: { rowDesc: Buffer; dataRow: Buffer; cmdComplete: Buffer },
): boolean {
  let offset = 0;
  while (offset < data.length) {
    if (offset + 5 > data.length) break;
    const msgType = data[offset];
    const msgLen = data.readInt32BE(offset + 1);

    if (msgType === 0x51) {
      // 'Q' = Simple Query
      socket.write(responses.rowDesc);
      socket.write(responses.dataRow);
      socket.write(responses.cmdComplete);
      socket.write(PG_READY);
    } else if (msgType === 0x58) {
      // 'X' = Terminate
      socket.end();
      return true;
    }

    offset += 1 + msgLen;
  }
  return false;
}

/**
 * Create a mock PostgreSQL server
 * Handles pg client with Simple Query protocol
 */
export function createMockPostgreSqlServer(port: number): Server {
  const responses = {
    rowDesc: pgRowDescription(),
    dataRow: pgDataRow(),
    cmdComplete: pgCommandComplete(),
  };

  const server = createServer((socket: Socket) => {
    let startupReceived = false;

    socket.on("data", (data) => {
      if (startupReceived) {
        handlePgMessages(socket, data, responses);
      } else if (isPgSslRequest(data)) {
        socket.write(Buffer.from([0x4e])); // 'N' = no SSL
      } else {
        // Startup message
        socket.write(PG_AUTH_OK);
        socket.write(PG_READY);
        startupReceived = true;
      }
    });

    socket.on("error", () => {
      // Ignore socket errors
    });
  });

  server.listen(port, () => {
    // biome-ignore lint/suspicious/noConsole: server startup logging
    console.log(`Mock PostgreSQL server listening on port ${port}`);
  });

  return server;
}

// ─── Redis Mock ────────────────────────────────────────────────────────────────

const REDIS_PONG = "+PONG\r\n";
const REDIS_OK = "+OK\r\n";
const REDIS_ERR_UNKNOWN_CMD = "-ERR unknown command\r\n";

/**
 * Parse a single RESP array command starting at pos.
 * Returns the parsed args and the new position after the command.
 */
function parseRespArray(text: string, startPos: number): { args: string[]; pos: number } | null {
  const nlPos = text.indexOf("\r\n", startPos);
  if (nlPos === -1) return null;
  const count = Number.parseInt(text.substring(startPos + 1, nlPos), 10);
  let pos = nlPos + 2;

  const args: string[] = [];
  for (let i = 0; i < count; i++) {
    if (pos >= text.length || text[pos] !== "$") break;
    const lenEnd = text.indexOf("\r\n", pos);
    if (lenEnd === -1) break;
    const len = Number.parseInt(text.substring(pos + 1, lenEnd), 10);
    pos = lenEnd + 2;
    args.push(text.substring(pos, pos + len));
    pos += len + 2; // skip data + \r\n
  }
  return { args, pos };
}

/**
 * Parse an inline Redis command at pos.
 * Returns the parsed args and the new position.
 */
function parseInlineCommand(
  text: string,
  startPos: number,
): { args: string[]; pos: number } | null {
  const nlPos = text.indexOf("\r\n", startPos);
  if (nlPos === -1) {
    const line = text.substring(startPos).trim();
    return line.length > 0 ? { args: line.split(" "), pos: text.length } : null;
  }
  const line = text.substring(startPos, nlPos).trim();
  const pos = nlPos + 2;
  return line.length > 0 ? { args: line.split(" "), pos } : { args: [], pos };
}

/**
 * Parse RESP protocol commands from a buffer.
 * Returns array of command arrays (each command is an array of string arguments).
 * Handles both inline and RESP bulk string format.
 */
function parseRedisCommands(data: Buffer): string[][] {
  const text = data.toString();
  const commands: string[][] = [];
  let pos = 0;

  while (pos < text.length) {
    const result = text[pos] === "*" ? parseRespArray(text, pos) : parseInlineCommand(text, pos);

    if (!result) break;
    if (result.args.length > 0) {
      commands.push(result.args);
    }
    pos = result.pos;
  }

  return commands;
}

/**
 * Get response for a single Redis command
 */
function redisResponse(args: string[]): string {
  const cmd = (args[0] ?? "").toUpperCase();
  switch (cmd) {
    case "PING":
      return REDIS_PONG;
    case "AUTH":
      return REDIS_OK;
    case "SELECT":
      return REDIS_OK;
    case "QUIT":
      return REDIS_OK;
    case "CLIENT":
      return REDIS_OK;
    case "HELLO":
      // RESP3 negotiation - respond with error to force RESP2 fallback
      return REDIS_ERR_UNKNOWN_CMD;
    case "INFO":
      // Empty bulk string
      return "$0\r\n\r\n";
    case "COMMAND":
      // Empty array
      return "*0\r\n";
    case "CONFIG":
      // Empty array for CONFIG GET
      return "*0\r\n";
    default:
      return REDIS_OK;
  }
}

/**
 * Create a mock Redis server
 * Handles node-redis v4 RESP protocol with pipelined commands
 */
export function createMockRedisServer(port: number): Server {
  const server = createServer((socket: Socket) => {
    socket.on("data", (data) => {
      const commands = parseRedisCommands(data);

      // Respond to each command in the pipeline
      let shouldClose = false;
      const responses: string[] = [];

      for (const args of commands) {
        responses.push(redisResponse(args));
        if ((args[0] ?? "").toUpperCase() === "QUIT") {
          shouldClose = true;
        }
      }

      if (responses.length > 0) {
        socket.write(responses.join(""));
      }

      if (shouldClose) {
        socket.end();
      }
    });

    socket.on("error", () => {
      // Ignore socket errors
    });
  });

  server.listen(port, () => {
    // biome-ignore lint/suspicious/noConsole: server startup logging
    console.log(`Mock Redis server listening on port ${port}`);
  });

  return server;
}

// ─── Server Startup ────────────────────────────────────────────────────────────

/**
 * Start all database mock servers
 */
export function startDatabaseServers(ports: {
  mysql?: number;
  postgresql?: number;
  redis?: number;
  redisAuth?: number;
}): { mysql?: Server; postgresql?: Server; redis?: Server; redisAuth?: Server } {
  const servers: { mysql?: Server; postgresql?: Server; redis?: Server; redisAuth?: Server } = {};

  if (ports.mysql) {
    servers.mysql = createMockMySqlServer(ports.mysql);
  }
  if (ports.postgresql) {
    servers.postgresql = createMockPostgreSqlServer(ports.postgresql);
  }
  if (ports.redis) {
    servers.redis = createMockRedisServer(ports.redis);
  }
  if (ports.redisAuth) {
    servers.redisAuth = createMockRedisServer(ports.redisAuth);
  }

  return servers;
}
