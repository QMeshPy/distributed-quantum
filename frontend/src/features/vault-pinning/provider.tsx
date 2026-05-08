"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PinningService } from "./types";

interface PinningContextValue {
  defaultService: PinningService;
}

const PinningContext = createContext<PinningContextValue>({
  defaultService: "nft.storage",
});

export function PinningProvider({ children }: { children: ReactNode }) {
  return (
    <PinningContext.Provider value={{ defaultService: "nft.storage" }}>
      {children}
    </PinningContext.Provider>
  );
}

export function usePinningContext() {
  return useContext(PinningContext);
}
