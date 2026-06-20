"use client";

import { useState, useEffect, ReactNode } from "react";
import { NetworkContext } from "@/lib/context/NetworkContext";
import type { Network } from "@/lib/hooks/useNetwork";

const STORAGE_KEY = "open_audit_network";
const QUERY_PARAM = "network";

interface NetworkProviderClientProps {
  children: ReactNode;
  initialNetwork?: Network;
}

export function NetworkProviderClient({
  children,
  initialNetwork = "testnet",
}: NetworkProviderClientProps) {
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [isHydrated, setIsHydrated] = useState(false);

  // Initialize from localStorage and URL query on mount
  useEffect(() => {
    try {
      // Check URL query param first
      const params = new URLSearchParams(window.location.search);
      const queryNetwork = params.get(QUERY_PARAM) as Network | null;

      if (queryNetwork && ["testnet", "mainnet", "futurenet"].includes(queryNetwork)) {
        setNetwork(queryNetwork);
        // Persist to localStorage
        localStorage.setItem(STORAGE_KEY, queryNetwork);
      } else {
        // Fall back to localStorage
        const stored = localStorage.getItem(STORAGE_KEY) as Network | null;
        if (stored && ["testnet", "mainnet", "futurenet"].includes(stored)) {
          setNetwork(stored);
        }
      }
    } catch (e) {
      // Ignore (SSR or blocked storage)
    }
    setIsHydrated(true);
  }, []);

  // Sync to localStorage and URL whenever network changes
  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(STORAGE_KEY, network);

      // Update URL query param without causing full page reload
      const params = new URLSearchParams(window.location.search);
      params.set(QUERY_PARAM, network);
      window.history.replaceState({}, "", `?${params.toString()}`);
    } catch (e) {
      // Ignore
    }
  }, [network, isHydrated]);

  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}
