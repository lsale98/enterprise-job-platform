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
