import { OpenAuditError } from "./base";
import type { ErrorContext } from "./types";

/** Thrown when translation registry or custom ABI template processing fails. */
export class RegistryTemplateException extends OpenAuditError {
  constructor(message: string, context: ErrorContext = {}, cause?: unknown) {
    super("REGISTRY_TEMPLATE_ERROR", message, context, cause);
    this.name = "RegistryTemplateException";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
