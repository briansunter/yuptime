/**
 * Steam game server checker
 *
 * Queries game servers using Source Engine A2S query protocol (UDP)
 * Supports: CS:GO, Dota 2, TF2, L4D, L4D2, and other Source/Source 2 based games
 */

import { createSocket } from "node:dgram";
import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

interface A2SServerInfo {
  name: string;
  map: string;
  folder: string;
  game: string;
  players: number;
  maxPlayers: number;
  bots: number;
  serverType: string;
  environment: string;
  visibility: string;
  vac: boolean;
}

function parseA2SResponse(msg: Buffer): A2SServerInfo | { error: string } {
  if (msg.length < 6) {
    return { error: "Invalid A2S response (too short)" };
  }

  let offset = 4; // skip 4-byte header

  if (msg[offset] !== 0x49) {
    return { error: `Invalid A2S response type: ${msg[offset]}` };
  }

  offset++; // skip command byte
  msg.readUInt8(offset); // protocol version (unused)
  offset++;

  const readString = (): string => {
    let str = "";
    while (offset < msg.length && msg[offset] !== 0) {
      const charCode = msg[offset];
      if (charCode !== undefined) {
        str += String.fromCharCode(charCode);
      }
      offset++;
    }
    offset++; // skip null terminator
    return str;
  };

  const readByte = (): number => {
    const value = offset < msg.length ? msg.readUInt8(offset) : 0;
    offset++;
    return value;
  };

  const readChar = (): string => {
    const byte = offset < msg.length ? msg[offset] : undefined;
    offset++;
    return byte !== undefined ? String.fromCharCode(byte) : "?";
  };

  const name = readString();
  const map = readString();
  const folder = readString();
  const game = readString();
  const players = readByte();
  const maxPlayers = readByte();
  const bots = readByte();
  const serverType = readChar();
  const environment = readChar();
  const visibility = readChar();
  const vac = offset < msg.length ? msg.readUInt8(offset) === 1 : false;

  return {
    name,
    map,
    folder,
    game,
    players,
    maxPlayers,
    bots,
    serverType,
    environment,
    visibility,
    vac,
  };
}

/**
 * Query Steam game server using A2S protocol
 */
function queryA2SServer(
  host: string,
  port: number,
  timeout: number,
): Promise<{
  success: boolean;
  info?: A2SServerInfo;
  error?: string;
  latencyMs: number;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = createSocket("udp4");
    let responded = false;

    // A2S_INFO request packet
    const request = Buffer.from([
      0xff,
      0xff,
      0xff,
      0xff, // 4-byte header
      0x54, // A2S_INFO command
      ...Buffer.from("Source Engine Query\0"), // Payload with null terminator
      0x11,
      0x00,
      0x00,
      0x00, // Protocol version
    ]);

    const cleanup = () => {
      try {
        socket.close();
      } catch (_e) {
        // Ignore
      }
    };

    const respond = (result: {
      success: boolean;
      info?: A2SServerInfo;
      error?: string;
      latencyMs: number;
    }) => {
      if (!responded) {
        responded = true;
        cleanup();
        resolve(result);
      }
    };

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      respond({
        success: false,
        error: `A2S query timeout after ${timeout}s`,
        latencyMs: Date.now() - startTime,
      });
    }, timeout * 1000);

    socket.on("message", (msg) => {
      clearTimeout(timeoutHandle);
      const latencyMs = Date.now() - startTime;

      try {
        const parsed = parseA2SResponse(msg);
        if ("error" in parsed) {
          respond({ success: false, error: parsed.error, latencyMs });
          return;
        }
        respond({ success: true, info: parsed, latencyMs });
      } catch (error) {
        respond({
          success: false,
          error: `Failed to parse A2S response: ${error instanceof Error ? error.message : "Unknown"}`,
          latencyMs,
        });
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeoutHandle);
      respond({
        success: false,
        error: error.message || "Socket error",
        latencyMs: Date.now() - startTime,
      });
    });

    try {
      socket.send(request, 0, request.length, port, host, (err) => {
        if (err) {
          clearTimeout(timeoutHandle);
          respond({
            success: false,
            error: `Failed to send query: ${err.message}`,
            latencyMs: Date.now() - startTime,
          });
        }
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      respond({
        success: false,
        error: error instanceof Error ? error.message : "Error sending query",
        latencyMs: Date.now() - startTime,
      });
    }
  });
}

export async function checkSteam(monitor: Monitor, timeout: number): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.steam;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No Steam target configured",
    };
  }

  const startTime = Date.now();

  try {
    const { host, port } = target;

    if (!host || !port) {
      return {
        state: "down",
        latencyMs: 0,
        reason: "INVALID_CONFIG",
        message: "Steam target must have host and port",
      };
    }

    const result = await queryA2SServer(host, port, timeout);
    const latencyMs = result.latencyMs;

    if (!result.success) {
      return {
        state: "down",
        latencyMs,
        reason: "STEAM_QUERY_FAILED",
        message: result.error || "Steam server query failed",
      };
    }

    if (!result.info) {
      return {
        state: "down",
        latencyMs,
        reason: "STEAM_NO_INFO",
        message: "No server info returned",
      };
    }

    const info = result.info;

    // Check player count requirements if specified
    if (target.minPlayers !== undefined && info.players < target.minPlayers) {
      return {
        state: "down",
        latencyMs,
        reason: "STEAM_INSUFFICIENT_PLAYERS",
        message: `Only ${info.players}/${info.maxPlayers} players (min: ${target.minPlayers})`,
      };
    }

    if (target.maxPlayers !== undefined && info.players > target.maxPlayers) {
      return {
        state: "down",
        latencyMs,
        reason: "STEAM_TOO_MANY_PLAYERS",
        message: `${info.players}/${info.maxPlayers} players (max: ${target.maxPlayers})`,
      };
    }

    // Check specific map if required
    if (target.expectedMap && info.map !== target.expectedMap) {
      return {
        state: "down",
        latencyMs,
        reason: "STEAM_WRONG_MAP",
        message: `Wrong map: ${info.map} (expected: ${target.expectedMap})`,
      };
    }

    // All checks passed
    return {
      state: "up",
      latencyMs,
      reason: "STEAM_OK",
      message: `${info.name} - ${info.players}/${info.maxPlayers} players on ${info.map}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn({ monitor: monitor.metadata.name, error }, "Steam check failed");

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Steam check failed",
    };
  }
}
