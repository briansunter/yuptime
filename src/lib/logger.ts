import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const logLevel = process.env.LOG_LEVEL || (isDev ? "debug" : "info");

export const logger = pino(
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

export default logger;
