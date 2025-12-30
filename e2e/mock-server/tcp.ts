/**
 * TCP Mock Servers
 *
 * Provides various TCP endpoints for testing different scenarios.
 */

import * as net from "node:net";

// Port assignments
const TCP_CONNECT_PORT = 8081; // Accept and close
const TCP_BANNER_PORT = 8083; // Send banner on connect
const TCP_ECHO_PORT = 8084; // Echo server
const TCP_SLOW_PORT = 8085; // Slow response

export function startTcpServers() {
  // Simple connect server - accepts connection then closes
  const connectServer = net.createServer((socket) => {
    // Just accept and close after a brief moment
    setTimeout(() => {
      socket.end();
    }, 100);
  });
  connectServer.listen(TCP_CONNECT_PORT, () => {
    // Server listening
  });

  // Banner server - sends "READY\n" on connect
  const bannerServer = net.createServer((socket) => {
    socket.write("READY\n");
    socket.on("data", (_data) => {
      // Ignore incoming data
    });
    socket.on("close", () => {
      // Connection closed
    });
  });
  bannerServer.listen(TCP_BANNER_PORT, () => {
    // Server listening
  });

  // Echo server - echoes back what it receives
  const echoServer = net.createServer((socket) => {
    socket.on("data", (data) => {
      const received = data.toString().trim();

      // Echo with transformation (PING -> PONG)
      if (received === "PING") {
        socket.write("PONG\n");
      } else {
        socket.write(data);
      }
    });
    socket.on("close", () => {
      // Connection closed
    });
  });
  echoServer.listen(TCP_ECHO_PORT, () => {
    // Server listening
  });

  // Slow server - delays response by 3 seconds
  const slowServer = net.createServer((socket) => {
    setTimeout(() => {
      socket.write("SLOW_RESPONSE\n");
      socket.end();
    }, 3000);
  });
  slowServer.listen(TCP_SLOW_PORT, () => {
    // Server listening
  });

  return {
    connectServer,
    bannerServer,
    echoServer,
    slowServer,
  };
}
