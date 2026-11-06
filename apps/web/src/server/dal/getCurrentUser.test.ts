import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();

  return {
    ...original,
    cache: (fn: unknown) => fn,
  };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("../auth/getKeycloakAccessToken", () => ({
  getKeycloakAccessToken: vi.fn(),
}));

vi.mock("../http/apiRequest", () => ({
  apiRequest: vi.fn(),
}));

import { getKeycloakAccessToken } from "../auth/getKeycloakAccessToken";
import { apiRequest } from "../http/apiRequest";
import { ApiError } from "../http/ApiError";
import { getCurrentUser } from "./getCurrentUser";

const mockedToken = vi.mocked(getKeycloakAccessToken);
const mockedRequest = vi.mocked(apiRequest);

const validResponse = {
  subject: "11111111-1111-4111-8111-111111111111",
  tenants: [
    {
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantName: "Acme",
      role: "admin",
    },
  ],
};

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedToken.mockResolvedValue("valid-access-token");
    mockedRequest.mockResolvedValue(validResponse);
  });

  it("returns validated user memberships", async () => {
    const result = await getCurrentUser();

    expect(result).toEqual(validResponse);

    expect(mockedRequest).toHaveBeenCalledWith({
      path: "/v1/me",
      accessToken: "valid-access-token",
    });
  });

  it("redirects when the access token is missing", async () => {
    mockedToken.mockResolvedValue(null);

    await expect(getCurrentUser()).rejects.toThrow("REDIRECT:/auth/signin");

    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("redirects when the API returns unauthorized", async () => {
    mockedRequest.mockRejectedValue(new ApiError("UNAUTHORIZED", 401));

    await expect(getCurrentUser()).rejects.toThrow("REDIRECT:/auth/signin");
  });

  it("does not allow forbidden API access", async () => {
    mockedRequest.mockRejectedValue(new ApiError("FORBIDDEN", 403));

    await expect(getCurrentUser()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not suppress API unavailability", async () => {
    mockedRequest.mockRejectedValue(new ApiError("UNAVAILABLE", 503));

    await expect(getCurrentUser()).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("rejects an invalid API response", async () => {
    mockedRequest.mockResolvedValue({
      subject: validResponse.subject,
      tenants: [
        {
          tenantId: validResponse.tenants[0]!.tenantId,
          tenantName: "Acme",
          role: "superadmin",
        },
      ],
    });

    await expect(getCurrentUser()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
