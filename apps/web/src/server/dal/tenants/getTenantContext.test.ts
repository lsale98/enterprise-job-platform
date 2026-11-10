import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../http/ApiError";

vi.mock("server-only", () => ({}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();

  return {
    ...original,
    cache: (fn: unknown) => fn,
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("../requestAuthenticated", () => ({
  requestAuthenticated: vi.fn(),
}));

import { requestAuthenticated } from "../requestAuthenticated";
import { getTenantContext } from "./getTenantContext";

const requestMock = vi.mocked(requestAuthenticated);

const acmeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contosoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const validResponse = {
  tenant: {
    id: acmeId,
    name: "Acme",
    role: "admin" as const,
  },
  permissions: [
    "jobs:read",
    "jobs:create",
    "jobs:cancel",
    "members:manage",
    "audit:read",
  ],
};

describe("getTenantContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    requestMock.mockResolvedValue(validResponse);
  });

  it("requests context for the specified tenant only", async () => {
    const result = await getTenantContext(acmeId);

    expect(requestMock).toHaveBeenCalledExactlyOnceWith({
      path: `/v1/tenants/${acmeId}/context`,
    });

    expect(result).toEqual(validResponse);
  });

  it("returns the backend tenant DTO without mapping", async () => {
    const result = await getTenantContext(acmeId);

    expect(result.tenant).toEqual({
      id: acmeId,
      name: "Acme",
      role: "admin",
    });

    expect(result.permissions).toEqual(validResponse.permissions);
  });

  it("rejects malformed tenant identifiers without API calls", async () => {
    await expect(getTenantContext("invalid-id")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing tenant membership", async () => {
    requestMock.mockRejectedValue(new ApiError("NOT_FOUND", 404));

    await expect(getTenantContext(acmeId)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns 404 for forbidden tenant access", async () => {
    requestMock.mockRejectedValue(new ApiError("FORBIDDEN", 403));

    await expect(getTenantContext(acmeId)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects tenant ID mismatches", async () => {
    requestMock.mockResolvedValue({
      ...validResponse,
      tenant: {
        ...validResponse.tenant,
        id: contosoId,
      },
    });

    await expect(getTenantContext(acmeId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects invalid backend permissions", async () => {
    requestMock.mockResolvedValue({
      ...validResponse,
      permissions: ["platform:users:manage"],
    });

    await expect(getTenantContext(acmeId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects malformed backend tenant data", async () => {
    requestMock.mockResolvedValue({
      ...validResponse,
      tenant: {
        id: acmeId,
        name: "",
        role: "unknown-role",
      },
    });

    await expect(getTenantContext(acmeId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("propagates backend availability errors", async () => {
    requestMock.mockRejectedValue(new ApiError("UNAVAILABLE", 503));

    await expect(getTenantContext(acmeId)).rejects.toMatchObject({
      code: "UNAVAILABLE",
      status: 503,
    });
  });

  it("does not conceal authentication failures", async () => {
    requestMock.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(getTenantContext(acmeId)).rejects.toThrow("NEXT_REDIRECT");
  });
});
