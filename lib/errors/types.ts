/** Shared contextual metadata attached to domain exceptions and telemetry events. */
export interface ErrorContext {
  contractId?: string;
  ledgerSequence?: number;
  xdrHex?: string;
  blueprintName?: string;
  chunkIndex?: number;
  txHash?: string;
  operation?: string;
  [key: string]: string | number | boolean | undefined;
}

/** Machine-readable error codes used for grouping and API responses. */
export type ErrorCode =
  | "STELLAR_NETWORK_ERROR"
  | "XDR_PARSING_ERROR"
  | "REGISTRY_TEMPLATE_ERROR"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface StructuredErrorPayload {
  code: ErrorCode;
  message: string;
  context: ErrorContext;
}
