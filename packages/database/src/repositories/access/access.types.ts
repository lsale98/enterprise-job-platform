export interface TenantAccessRecord {
  id: string;
  name: string;
  role: string;
}

export interface ListMembershipsOptions {
  search: string;
  limit: number;
  cursor?: string;
}

export interface MembershipPage {
  items: TenantAccessRecord[];
  nextCursor: string | null;
}

export interface TenantListRow extends TenantAccessRecord {
  sortName: string;
}
