import { JobInputSchema } from "@lab/contracts";

import type { JobExecutor } from "../processing.types.js";

export const executeReport: JobExecutor = async (job, signal) => {
  signal.throwIfAborted();

  const input = JobInputSchema.parse(job.input);

  if (input.type !== "report" || job.type !== "report") {
    throw new TypeError("Invalid report job input");
  }

  const count = input.numbers.length;

  const sum = input.numbers.reduce((total, value) => total + value, 0);

  if (count === 0 || !Number.isFinite(sum)) {
    throw new RangeError("Invalid report calculation");
  }

  signal.throwIfAborted();

  return {
    count,
    sum,
    average: sum / count,
  };
};
