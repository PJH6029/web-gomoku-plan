import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let serverEnvCache: ServerEnv | null = null;

function getDefaultDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return "file:./data/gomoku.db";
}

export function getServerEnv(): ServerEnv {
  if (!serverEnvCache) {
    const databaseUrl = getDefaultDatabaseUrl();
    const sessionSecret =
      process.env.SESSION_SECRET ??
      (process.env.NODE_ENV === "production" ? undefined : "development-session-secret-change-me");

    serverEnvCache = serverEnvSchema.parse({
      DATABASE_URL: databaseUrl,
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || undefined,
      SESSION_SECRET: sessionSecret,
    });
  }

  return serverEnvCache;
}

export function resetEnvCacheForTests() {
  serverEnvCache = null;
}
