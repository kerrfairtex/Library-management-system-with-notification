/**
 * Pure helpers for server error logs (no Next imports, so they are tested
 * directly and usable from instrumentation.ts).
 */
import { randomUUID } from "crypto";

export function newRequestId(): string {
  return randomUUID();
}

/** The most useful single-line-ish description of anything thrown or returned as an error. */
export function describeError(error: unknown): string {
  if (error == null) return "(no error object)";
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (typeof error === "object") {
    // Supabase/PostgREST errors are plain objects: { code, message, details, hint }.
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/** The log line for a failed request. Exported for tests. */
export function serverErrorLogLine(requestId: string, context: string, status: number, error: unknown): string {
  return `[request ${requestId}] ${context} -> ${status}: ${describeError(error)}`;
}
