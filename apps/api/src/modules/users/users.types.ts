import type { UserTenantMembership } from "@lab/database/membership-repository";

export interface UsersDependencies {
  listMembershipsBySubject: (
    subject: string,
  ) => Promise<UserTenantMembership[]>;
}
