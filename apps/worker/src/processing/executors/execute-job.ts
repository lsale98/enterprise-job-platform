import type { JobExecutor } from "../processing.types.js";

import { executeReport } from "./report.executor.js";

export const executeJob: JobExecutor = async (job, signal) => {
  signal.throwIfAborted();

  switch (job.type) {
    case "report":
      return executeReport(job, signal);

    case "import":
      throw new Error("Import executor is not implemented");

    case "notification":
      throw new Error("Notification executor is not implemented");
  }
};
