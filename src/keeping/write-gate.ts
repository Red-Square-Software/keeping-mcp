// Shared write-gate helper (D-3-01, D-3-02, D-3-04, D-3-16, D-3-17).
//
// All Phase 3 write tools (`keeping_add_entry`, `keeping_update_entry`,
// `keeping_delete_entry`, `keeping_start_timer`, `keeping_stop_timer`,
// `keeping_resume_timer`) route their API call through `previewOrCall<T>`.
// The helper enforces the AND-gate dry-run-by-default contract:
//
//   call API ⇔ cfg.requireConfirm === false OR cfg.confirm === true
//
// (equivalently, return preview ⇔ cfg.requireConfirm && !cfg.confirm).
//
// `classifyAmbiguous(err)` returns true only for failure modes whose outcome
// cannot be determined from the client side (5xx from Keeping, abort/timeout,
// raw network errors that surface as TypeError). Tools render those as the
// byte-locked `AMBIGUOUS_TEXT` envelope per D-3-16. Everything else flows
// through `toIsErrorContent` unchanged (definite-fail path, SAFE-04).
//
// BASE is duplicated from `src/keeping/client.ts:32` deliberately — D-3-02
// makes the preview-URL assertion trivially testable when BASE is co-located,
// and the duplication avoids reaching into client.ts's internals.

import type { KeepingClient } from "./client.js";

const BASE = "https://api.keeping.nl/v1";

export type WriteMethod = "POST" | "PATCH" | "DELETE";

export interface WriteRequest {
  method: WriteMethod;
  path: string;
  body?: unknown;
}

export interface WriteGateConfig {
  /** Resolved value of `KEEPING_REQUIRE_CONFIRM`. */
  requireConfirm: boolean;
  /** Tool input `confirm` argument coerced to boolean (`input.confirm === true`). */
  confirm: boolean;
}

export interface WouldPost {
  would_post: {
    method: WriteMethod;
    url: string;
    body: unknown;
  };
}

/**
 * Either return a `{ would_post }` preview (dry-run) or delegate to
 * `client.post / patch / delete` (confirm). Writes never auto-retry — that
 * invariant is enforced at the `KeepingClient.request<T>` level via
 * `shouldRetry`, not here.
 */
export async function previewOrCall<T>(
  client: KeepingClient,
  cfg: WriteGateConfig,
  req: WriteRequest,
): Promise<WouldPost | T> {
  if (cfg.requireConfirm && !cfg.confirm) {
    return {
      would_post: {
        method: req.method,
        url: `${BASE}${req.path}`,
        // DELETE has no body; collapse undefined to null so the preview is
        // serialisable and the wire-shape is consistent across methods (D-3-02).
        body: req.body ?? null,
      },
    };
  }
  switch (req.method) {
    case "POST":
      return client.post<T>(req.path, req.body);
    case "PATCH":
      return client.patch<T>(req.path, req.body);
    case "DELETE":
      return client.delete<T>(req.path);
  }
}

/**
 * Byte-locked ambiguous-failure wording per D-3-16 / WRITE-05. Tools append
 * a parenthetical `(<original err.message>)` AFTER this string when rendering
 * the isError envelope.
 *
 * Em-dash, lowercase, single trailing period — verified by Test W11.
 */
export const AMBIGUOUS_TEXT = "outcome unknown — verify with keeping_list_entries before retrying.";

/**
 * Returns true when the error indicates a write whose outcome cannot be
 * determined from the client side:
 *
 *   - `KeepingApiError` (or any object with a numeric `status >= 500`)
 *   - `AbortError` (10-second timeout fired)
 *   - raw `TypeError` (network / DNS / TLS failure surfaced by fetch)
 *
 * Duck-typing on `.status` avoids a runtime import of `KeepingApiError` and
 * is the same shape the OpenAPI envelope guarantees. Non-numeric `.status`
 * is rejected (Test W10).
 */
export function classifyAmbiguous(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err instanceof TypeError) return true;
  }
  if (
    err !== null &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status >= 500;
  }
  return false;
}
