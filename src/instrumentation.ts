/**
 * Errors thrown (not returned) by route handlers, pages or the proxy never
 * reach serverError(); Next turns them into a 500 itself. Log those too,
 * with a request id: Render's own id when present, else the React digest,
 * else a new one. The browser still sees only the generic error page.
 */
import type { Instrumentation } from "next";
import { describeError, newRequestId } from "@/lib/error-log";

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  const requestId =
    headerValue(request.headers, "rndr-id") ?? headerValue(request.headers, "x-request-id") ?? digest ?? newRequestId();
  console.error(
    `[request ${requestId}] unhandled ${context.routeType} error in ${request.method} ${request.path} (${context.routePath}): ${describeError(err)}`
  );
};
