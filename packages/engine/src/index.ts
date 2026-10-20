import type { JobInput, JobType } from "@lab/contracts";

export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("limit must be a positive integer");
  const result: R[] = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      signal?.throwIfAborted();
      const index = cursor++;
      result[index] = await task(items[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return result;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelayMs: number;
    signal?: AbortSignal;
    retryable?: (error: unknown) => boolean;
  },
): Promise<T> {
  const { maxAttempts, baseDelayMs, signal, retryable = () => true } = options;
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    baseDelayMs < 0
  ) {
    throw new RangeError("invalid retry policy");
  }
  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts || !retryable(error)) throw error;
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), 30_000);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, backoff);
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal?.reason ?? new Error("aborted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
}

export type JobResultByType = {
  report: { count: number; sum: number; average: number };
  import: { accepted: number };
  notification: { stored: true };
};
export type ResultFor<K extends JobType> = JobResultByType[K];
export type JobExecutor = (
  input: JobInput,
) => Promise<JobResultByType[JobType]>;
export async function executeJob(
  input: JobInput,
): Promise<JobResultByType[JobType]> {
  switch (input.type) {
    case "report": {
      const sum = input.numbers.reduce((acc, n) => acc + n, 0);
      if (!Number.isFinite(sum)) throw new RangeError("report sum overflow");
      return {
        count: input.numbers.length,
        sum,
        average: sum / input.numbers.length,
      };
    }
    case "import": {
      // Imports are persisted by the worker transaction; never claim that an in-memory map is durable.
      return { accepted: input.records.length };
    }
    case "notification": {
      // The worker writes a durable outbox row; actual email transport is a separate adapter.
      return { stored: true as const };
    }
    default: {
      const unreachable: never = input;
      throw new Error(`Unsupported job type: ${String(unreachable)}`);
    }
  }
}

export { LruTtlCache } from "./lru.js";
