import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type TradingEnvironmentMode = 'PAPER' | 'TESTNET' | 'LIVE';

const storageKey = 'hbs-global-trading-environment';

type TradingEnvironmentContextValue = {
  mode: TradingEnvironmentMode;
  setMode: (mode: TradingEnvironmentMode) => void;
  liveExecutionEnabled: false;
};

const TradingEnvironmentContext = createContext<TradingEnvironmentContextValue | null>(null);

export function TradingEnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TradingEnvironmentMode>(() => {
    const stored = window.localStorage.getItem(storageKey);
    return stored === 'TESTNET' || stored === 'LIVE' ? stored : 'PAPER';
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, mode);
  }, [mode]);

  const value = useMemo<TradingEnvironmentContextValue>(() => ({
    mode,
    setMode,
    liveExecutionEnabled: false,
  }), [mode]);

  return <TradingEnvironmentContext.Provider value={value}>{children}</TradingEnvironmentContext.Provider>;
}

export function useTradingEnvironment() {
  const context = useContext(TradingEnvironmentContext);
  if (!context) throw new Error('useTradingEnvironment must be used within TradingEnvironmentProvider');
  return context;
}
