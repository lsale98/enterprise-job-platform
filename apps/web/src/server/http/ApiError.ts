export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status?: number,
  ) {
    super(code);

    this.name = "ApiError";
  }
}
