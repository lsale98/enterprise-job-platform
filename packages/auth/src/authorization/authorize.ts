import {
  hasPermission,
  PermissionSchema,
  RoleSchema,
  type Permission,
  type Role,
} from "@lab/contracts";

export interface Membership {
  tenantId: string;
  subject: string;
  role: string;
}

export interface MembershipRepository {
  findMembership(subject: string, tenantId: string): Promise<Membership | null>;
}

export interface AuthorizationContext {
  subject: string;
  tenantId: string;
  role: Role;
}

export type AuthorizationResult =
  | {
      allowed: true;
      context: AuthorizationContext;
    }
  | {
      allowed: false;
      reason: "FORBIDDEN";
    };

export function createAuthorizer(repository: MembershipRepository) {
  return async function authorize(
    subject: string,
    tenantId: string,
    permission: Permission,
  ): Promise<AuthorizationResult> {
    if (
      typeof subject !== "string" ||
      subject.trim().length === 0 ||
      typeof tenantId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        tenantId,
      ) ||
      !PermissionSchema.safeParse(permission).success
    ) {
      return { allowed: false, reason: "FORBIDDEN" };
    }

    const membership = await repository.findMembership(subject, tenantId);

    if (!membership) {
      return { allowed: false, reason: "FORBIDDEN" };
    }

    if (membership.subject !== subject || membership.tenantId !== tenantId) {
      return { allowed: false, reason: "FORBIDDEN" };
    }

    const parsedRole = RoleSchema.safeParse(membership.role);

    if (!parsedRole.success || !hasPermission(parsedRole.data, permission)) {
      return { allowed: false, reason: "FORBIDDEN" };
    }

    return {
      allowed: true,
      context: {
        subject: membership.subject,
        tenantId: membership.tenantId,
        role: parsedRole.data,
      },
    };
  };
}
