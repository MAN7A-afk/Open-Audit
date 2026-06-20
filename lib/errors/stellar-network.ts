import { OpenAuditError } from "./base";
import type { ErrorContext } from "./types";

/** Thrown when Stellar RPC, Horizon, or network transport operations fail. */
export class StellarNetworkException extends OpenAuditError {
  readonly retriable: boolean;

  constructor(
    message: string,
    context: ErrorContext = {},
    options: { retriable?: boolean; cause?: unknown } = {}
  ) {
    super("STELLAR_NETWORK_ERROR", message, context, options.cause);
    this.name = "StellarNetworkException";
    this.retriable = options.retriable ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
