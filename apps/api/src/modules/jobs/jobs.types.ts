import type { AuthorizationResult } from "@lab/auth";
import type { Permission } from "@lab/contracts";

import type {
  CreateJobOutcome,
  CreateJobParams,
} from "@lab/database/job-repository";

export interface JobsDependencies {
  authorize: (
    subject: string,
    tenantId: string,
    permission: Permission,
  ) => Promise<AuthorizationResult>;

  createJob: (params: CreateJobParams) => Promise<CreateJobOutcome>;
}

export interface CreateJobRouteParams {
  tenantId: string;
}
