"use client";

import { createContext, useContext, ReactNode } from "react";
import type { Network } from "../hooks/useNetwork";

export interface NetworkContextValue {
  network: Network;
  setNetwork: (network: Network) => void;
}

export const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

export function useNetworkContext(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetworkContext must be used within NetworkProvider");
  }
  return context;
}

export interface NetworkProviderProps {
  children: ReactNode;
  initialNetwork?: Network;
}

export function NetworkProvider({ children, initialNetwork }: NetworkProviderProps) {
  // Note: actual state is managed in NetworkProviderClient
  // This is just the context definition
  return <>{children}</>;
}
