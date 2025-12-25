/**
 * SMTP notification provider (Email)
 * Implements a basic SMTP client for sending email notifications
 */

import { Socket } from "node:net";
import { TLSSocket, connect as tlsConnect } from "node:tls";
import { logger } from "../../lib/logger";
import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

/**
 * Send a command to the SMTP server and wait for response
 */
async function sendCommand(
  socket: Socket | TLSSocket,
  command: string,
  expectedCode?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `SMTP timeout waiting for response to: ${command.split(" ")[0]}`,
        ),
      );
    }, 30000);

    const onData = (data: Buffer) => {
      clearTimeout(timeout);
      socket.removeListener("data", onData);
      const response = data.toString();
      const responseCode = parseInt(response.substring(0, 3), 10);

      if (expectedCode && responseCode !== expectedCode) {
        reject(
          new Error(
            `SMTP error: expected ${expectedCode}, got ${response.trim()}`,
          ),
        );
      } else {
        resolve(response);
      }
    };

    socket.on("data", onData);

    if (command) {
      socket.write(`${command}\r\n`);
    }
  });
}

/**
 * Create HTML email body
 */
function createHtmlBody(title: string, body: string): string {
  const alertClass = title.includes("DOWN") ? "alert-down" : "alert-up";
  return `<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
.alert-box { padding: 20px; border-radius: 8px; margin: 20px 0; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.alert-down { border-left: 4px solid #dc3545; }
.alert-up { border-left: 4px solid #28a745; }
h2 { margin: 0 0 15px 0; color: #333; }
pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; margin: 15px 0; white-space: pre-wrap; }
.timestamp { color: #666; font-size: 0.9em; margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; }
.footer { color: #999; font-size: 0.8em; margin-top: 20px; text-align: center; }
</style></head>
<body>
<div class="alert-box ${alertClass}">
<h2>${escapeHtml(title)}</h2>
<pre>${escapeHtml(body)}</pre>
<div class="timestamp">Sent at ${new Date().toISOString()}</div>
</div>
<div class="footer">Sent by KubeKuma Monitoring</div>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Encode string to base64 for SMTP AUTH
 */
function base64Encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

export async function sendSmtpNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  if (!config.smtp) {
    return {
      success: false,
      error: "SMTP not configured",
    };
  }

  const { host, port, useTls, from, to } = config.smtp;

  let username: string | undefined;
  let password: string | undefined;

  try {
    // Resolve credentials from Kubernetes secrets
    if (config.smtp.usernameSecretRef) {
      username = await resolveSecret(
        config.smtp.usernameSecretRef.namespace || "monitoring",
        config.smtp.usernameSecretRef.name,
        config.smtp.usernameSecretRef.key,
      );
    }

    if (config.smtp.passwordSecretRef) {
      password = await resolveSecret(
        config.smtp.passwordSecretRef.namespace || "monitoring",
        config.smtp.passwordSecretRef.name,
        config.smtp.passwordSecretRef.key,
      );
    }
  } catch (error) {
    logger.error({ error }, "Failed to resolve SMTP credentials");
    return {
      success: false,
      error: `Failed to resolve SMTP credentials: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  return new Promise((resolve) => {
    let socket: Socket | TLSSocket;
    let resolved = false;

    const cleanup = () => {
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
    };

    const handleError = (error: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        logger.error({ error, host, port }, "SMTP connection error");
        resolve({
          success: false,
          error: error.message,
        });
      }
    };

    const connectionTimeout = setTimeout(() => {
      handleError(new Error("SMTP connection timeout"));
    }, 60000);

    const runSmtpSession = async () => {
      try {
        // Wait for server greeting
        await sendCommand(socket, "", 220);

        // Send EHLO
        const ehloResponse = await sendCommand(socket, `EHLO kubekuma`, 250);
        const supportsStartTls = ehloResponse.includes("STARTTLS");

        // Upgrade to TLS if needed and supported
        if (useTls && supportsStartTls && !(socket instanceof TLSSocket)) {
          await sendCommand(socket, "STARTTLS", 220);

          // Upgrade the connection to TLS
          const tlsSocket = tlsConnect({
            socket: socket as Socket,
            host,
            rejectUnauthorized: false, // Allow self-signed certs
          });

          await new Promise<void>((res, rej) => {
            tlsSocket.once("secureConnect", res);
            tlsSocket.once("error", rej);
          });

          socket = tlsSocket;
          socket.on("error", handleError);

          // Re-send EHLO after STARTTLS
          await sendCommand(socket, `EHLO kubekuma`, 250);
        }

        // Authenticate if credentials provided
        if (username && password) {
          await sendCommand(socket, "AUTH LOGIN", 334);
          await sendCommand(socket, base64Encode(username), 334);
          await sendCommand(socket, base64Encode(password), 235);
        }

        // Set sender
        await sendCommand(socket, `MAIL FROM:<${from}>`, 250);

        // Set recipients
        for (const recipient of to) {
          await sendCommand(socket, `RCPT TO:<${recipient}>`, 250);
        }

        // Start data
        await sendCommand(socket, "DATA", 354);

        // Build message
        const htmlBody = createHtmlBody(title, body);
        const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        const message = [
          `From: ${from}`,
          `To: ${to.join(", ")}`,
          `Subject: ${title}`,
          `MIME-Version: 1.0`,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          `Date: ${new Date().toUTCString()}`,
          `X-Mailer: KubeKuma-Monitoring`,
          "",
          `--${boundary}`,
          `Content-Type: text/plain; charset=UTF-8`,
          `Content-Transfer-Encoding: 8bit`,
          "",
          body,
          "",
          `--${boundary}`,
          `Content-Type: text/html; charset=UTF-8`,
          `Content-Transfer-Encoding: 8bit`,
          "",
          htmlBody,
          "",
          `--${boundary}--`,
          "",
          ".",
        ].join("\r\n");

        await sendCommand(socket, message, 250);

        // Quit
        await sendCommand(socket, "QUIT", 221);

        clearTimeout(connectionTimeout);
        cleanup();

        if (!resolved) {
          resolved = true;
          logger.info(
            { to, subject: title },
            "SMTP notification sent successfully",
          );
          resolve({
            success: true,
            sentAt: new Date(),
          });
        }
      } catch (error) {
        clearTimeout(connectionTimeout);
        handleError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Connect to SMTP server
    try {
      if (useTls && port === 465) {
        // Implicit TLS (SMTPS)
        socket = tlsConnect({
          host,
          port,
          rejectUnauthorized: false,
        });
        socket.once("secureConnect", runSmtpSession);
      } else {
        // Plain connection (with optional STARTTLS)
        socket = new Socket();
        socket.connect(port, host, runSmtpSession);
      }

      socket.on("error", handleError);
    } catch (error) {
      clearTimeout(connectionTimeout);
      handleError(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
