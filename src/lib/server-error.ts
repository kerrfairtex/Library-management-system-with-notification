/**
 * Every 5xx from an API route goes through serverError(): the real error
 * (stack, Supabase code/details) is written to the server log with a
 * request id, and the response carries the same id (body `requestId` and
 * `x-request-id` header) so a report can be matched to its log line.
 * The response body is otherwise unchanged; the UI shows its own generic
 * message for any 5xx (src/lib/errors.ts).
 */
import { NextResponse } from "next/server";
import { newRequestId, serverErrorLogLine } from "./error-log";

export { describeError, newRequestId, serverErrorLogLine } from "./error-log";

export function serverError(
  context: string,
  error: unknown,
  body: Record<string, unknown>,
  status = 500
): NextResponse {
  const requestId = newRequestId();
  console.error(serverErrorLogLine(requestId, context, status, error));
  return NextResponse.json({ ...body, requestId }, { status, headers: { "x-request-id": requestId } });
}
