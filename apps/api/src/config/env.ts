import { z } from "zod";

const EnvSchema = z.object({
  APP_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  HOST: z.string().min(1).default("127.0.0.1"),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DATABASE_URL: z.string().min(1),

  AUTH_KEYCLOAK_ISSUER: z.url(),

  AUTH_API_AUDIENCE: z.string().min(1),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return EnvSchema.parse(env);
}
