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
