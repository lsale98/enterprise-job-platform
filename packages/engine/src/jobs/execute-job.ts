import type { JobInput, JobType } from "@lab/contracts";

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

      if (!Number.isFinite(sum)) {
        throw new RangeError("report sum overflow");
      }

      return {
        count: input.numbers.length,
        sum,
        average: sum / input.numbers.length,
      };
    }

    case "import": {
      // Imports are persisted by the worker transaction.
      return { accepted: input.records.length };
    }

    case "notification": {
      // The worker writes a durable outbox row.
      return { stored: true as const };
    }

    default: {
      const unreachable: never = input;
      throw new Error(`Unsupported job type: ${String(unreachable)}`);
    }
  }
}
