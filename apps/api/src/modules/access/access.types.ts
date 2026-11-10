import type {
  ListMembershipsOptions,
  MembershipPage,
  TenantAccessRecord,
} from "@lab/database/access-repository";

export interface AccessDependencies {
  findTenantAccess: (
    subject: string,
    tenantId: string,
  ) => Promise<TenantAccessRecord | null>;

  findDefaultTenantId: (subject: string) => Promise<string | null>;

  isPlatformAdmin: (subject: string) => Promise<boolean>;

  listAvailableMemberships: (
    subject: string,
    options: ListMembershipsOptions,
  ) => Promise<MembershipPage>;
}

export interface AccessRoutesOptions {
  dependencies: AccessDependencies;
}

export interface TenantContextRouteParams {
  tenantId: string;
}

export interface ListAvailableTenantsQuery {
  search?: string;
  limit?: string;
  cursor?: string;
}
