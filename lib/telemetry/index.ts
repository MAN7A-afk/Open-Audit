import { isOpenAuditError, normalizeError, type ErrorContext } from "@/lib/errors";
import type { OpenAuditError } from "@/lib/errors/base";

export interface CaptureOptions {
  /** Extra context merged into the error payload before reporting. */
  context?: ErrorContext;
  /** Override the default fingerprint used for alert grouping. */
  fingerprint?: string[];
  level?: "error" | "warning" | "info";
}

let sentryInitialized = false;

async function initSentry(): Promise<boolean> {
  if (sentryInitialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0,
    });
    sentryInitialized = true;
    return true;
  } catch {
    return false;
  }
}

function buildFingerprint(error: OpenAuditError, override?: string[]): string[] {
  return override ?? error.fingerprint();
}

/**
 * Captures an exception with contextual metadata for structured logging and
 * optional Sentry grouping (by error code + contract address).
 */
export async function captureException(
  error: unknown,
  options: CaptureOptions = {}
): Promise<OpenAuditError> {
  const normalized = isOpenAuditError(error)
    ? error
    : normalizeError(error, "An unexpected error occurred", options.context ?? {});

  const mergedContext = { ...normalized.context, ...options.context };
  const fingerprint = buildFingerprint(normalized, options.fingerprint);
  const payload = {
    ...normalized.toJSON(),
    context: mergedContext,
    fingerprint,
    level: options.level ?? "error",
    timestamp: new Date().toISOString(),
  };

  if (options.level === "warning") {
    console.warn("[open-audit:telemetry]", JSON.stringify(payload));
  } else {
    console.error("[open-audit:telemetry]", JSON.stringify(payload));
  }

  const sentryReady = await initSentry();
  if (sentryReady) {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.withScope((scope) => {
        scope.setFingerprint(fingerprint);
        scope.setTag("error_code", normalized.code);
        if (mergedContext.contractId) {
          scope.setTag("contract_id", String(mergedContext.contractId));
        }
        if (mergedContext.ledgerSequence !== undefined) {
          scope.setTag("ledger_sequence", String(mergedContext.ledgerSequence));
        }
        scope.setContext("open_audit", mergedContext);
        Sentry.captureException(normalized);
      });
    } catch {
      // Sentry is optional; structured console logging is the fallback.
    }
  }

  return normalized;
}

/** Synchronous variant for hot paths that cannot await telemetry I/O. */
export function captureExceptionSync(
  error: unknown,
  options: CaptureOptions = {}
): OpenAuditError {
  void captureException(error, options);
  return isOpenAuditError(error)
    ? error
    : normalizeError(error, "An unexpected error occurred", options.context ?? {});
}
