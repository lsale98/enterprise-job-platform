import type { JobType } from "./job.schema.js";

export const JOB_LABELS = {
  report: "Report",
  import: "Data import",
  notification: "Notification",
} satisfies Record<JobType, string>;
