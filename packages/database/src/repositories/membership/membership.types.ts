export interface MembershipRecord {
  tenantId: string;
  subject: string;
  role: string;
}

export interface UserTenantMembership {
  tenantId: string;
  tenantName: string;
  role: string;
}
