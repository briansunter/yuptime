import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL || "sqlite:./kubekuma.db";
const isPostgres = databaseUrl.startsWith("postgresql://");

export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  driver: isPostgres ? "pg" : "sqlite",
  dbCredentials: isPostgres
    ? {
        url: databaseUrl,
      }
    : {
        url: databaseUrl,
      },
  verbose: true,
  strict: true,
});
