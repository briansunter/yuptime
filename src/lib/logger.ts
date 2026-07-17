import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const logLevel = process.env.LOG_LEVEL || (isDev ? "debug" : "info");
const workerProtocol = process.env.YUPTIME_WORKER_PROTOCOL === "stdio";

export const logger = workerProtocol
  ? pino({ level: logLevel }, pino.destination(2))
  : pino(
      isDev
        ? {
            level: logLevel,
            transport: {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
              },
            },
          }
        : {
            level: logLevel,
          },
    );
