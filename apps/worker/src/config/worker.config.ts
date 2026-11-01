import { z } from "zod";

const WorkerEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),

    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),

    WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),

    WORKER_LEASE_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),

    WORKER_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(10_000),
  })
  .refine(
    (config) =>
      config.WORKER_HEARTBEAT_MS < (config.WORKER_LEASE_SECONDS * 1000) / 2,
    {
      message: "Heartbeat interval must be less than half the lease duration",
      path: ["WORKER_HEARTBEAT_MS"],
    },
  );

export interface WorkerConfig {
  databaseUrl: string;
  concurrency: number;
  pollMs: number;
  leaseSeconds: number;
  heartbeatMs: number;
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = WorkerEnvironmentSchema.parse(env);

  return {
    databaseUrl: parsed.DATABASE_URL,
    concurrency: parsed.WORKER_CONCURRENCY,
    pollMs: parsed.WORKER_POLL_MS,
    leaseSeconds: parsed.WORKER_LEASE_SECONDS,
    heartbeatMs: parsed.WORKER_HEARTBEAT_MS,
  };
}
