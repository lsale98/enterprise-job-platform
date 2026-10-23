import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const statusCode =
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 600
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    request.log.error({ err: error }, "Internal server error");

    return reply.code(statusCode).send({
      statusCode,
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  }

  return reply.code(statusCode).send({
    statusCode,
    error: "Bad Request",
    message: error.message,
  });
}
