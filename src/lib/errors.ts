/** Plain-language messages for failed requests. Pure, so it is tested directly. */

export const OFFLINE_MESSAGE = "Couldn’t reach the library server. Check your connection and try again.";

/**
 * What a person sees when a request fails. Validation and permission
 * messages (4xx) are written for people and pass through; server faults
 * (5xx) can carry raw database text, so they get a plain message instead.
 */
export function friendlyError(status: number, message?: unknown): string {
  if (status >= 500) return "Something went wrong on the library server. Try again in a moment.";
  if (typeof message === "string" && message.trim()) return message;
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "You don’t have access to this.";
  if (status === 404) return "That record no longer exists.";
  return "The request didn’t go through. Try again.";
}
