import { OpenAuditError } from "./base";
import type { ErrorContext } from "./types";

/** Thrown when XDR decoding or transaction meta parsing fails. */
export class XdrParsingException extends OpenAuditError {
  constructor(message: string, context: ErrorContext = {}, cause?: unknown) {
    super("XDR_PARSING_ERROR", message, context, cause);
    this.name = "XdrParsingException";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
