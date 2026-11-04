import React, { createContext, useContext, useMemo } from "react";
import { RibbonCommandContext, RibbonDispatcher } from "./RibbonDispatcher";

const RibbonDispatcherContext = createContext<RibbonDispatcher | null>(null);

export interface RibbonProviderProps {
  context: RibbonCommandContext;
  children: React.ReactNode;
}

export const RibbonProvider: React.FC<RibbonProviderProps> = ({ context, children }) => {
  const dispatcher = useMemo(() => new RibbonDispatcher(context), []);

  // Keep internal context up-to-date across parent rerenders
  dispatcher.updateContext(context);

  return (
    <RibbonDispatcherContext.Provider value={dispatcher}>
      {children}
    </RibbonDispatcherContext.Provider>
  );
};

export const useRibbonDispatcher = (): RibbonDispatcher => {
  const dispatcher = useContext(RibbonDispatcherContext);
  if (!dispatcher) {
    throw new Error("useRibbonDispatcher must be used within a RibbonProvider");
  }
  return dispatcher;
};
