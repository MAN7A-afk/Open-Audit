export { OpenAuditError } from "./base";
export { StellarNetworkException } from "./stellar-network";
export { XdrParsingException } from "./xdr-parsing";
export { RegistryTemplateException } from "./registry-template";
export type { ErrorCode, ErrorContext, StructuredErrorPayload } from "./types";

import { OpenAuditError } from "./base";
import { RegistryTemplateException } from "./registry-template";
import { StellarNetworkException } from "./stellar-network";
import { XdrParsingException } from "./xdr-parsing";
import type { ErrorContext } from "./types";

export function isOpenAuditError(error: unknown): error is OpenAuditError {
  return error instanceof OpenAuditError;
}

/** Wraps unknown errors into the closest domain exception when possible. */
export function normalizeError(
  error: unknown,
  fallbackMessage: string,
  context: ErrorContext = {}
): OpenAuditError {
  if (error instanceof OpenAuditError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("xdr") ||
      message.includes("decode") ||
      message.includes("fromxdr")
    ) {
      return new XdrParsingException(error.message, context, error);
    }

    if (
      message.includes("429") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("network") ||
      message.includes("econn") ||
      message.includes("etimedout")
    ) {
      return new StellarNetworkException(error.message, context, {
        cause: error,
        retriable: true,
      });
    }

    return new OpenAuditError("INTERNAL_ERROR", error.message, context, error);
  }

  return new OpenAuditError("INTERNAL_ERROR", fallbackMessage, context, error);
}

/** Converts validation failures into structured registry/template errors. */
export function validationError(message: string, context: ErrorContext = {}): RegistryTemplateException {
  return new RegistryTemplateException(message, context);
}
