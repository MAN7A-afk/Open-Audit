/**
 * Formatting utilities for Soroban event data.
 */

export * from "./core";

/**
 * Formats a Unix timestamp into a human-readable relative time string.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
