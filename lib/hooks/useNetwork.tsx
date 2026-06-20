"use client";

import { useNetworkContext } from "@/lib/context/NetworkContext";

export type Network = "testnet" | "mainnet" | "futurenet";

/**
 * Hook to access and update the global network selection.
 * Must be used within a NetworkProvider.
 */
export function useNetwork() {
  return useNetworkContext();
}
