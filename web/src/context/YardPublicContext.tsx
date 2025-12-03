import { createContext, useContext, useState, type ReactNode } from 'react';

interface YardPublicContextValue {
  activeYardId: string | null;
  activeYardName?: string;
  setActiveYard: (yardId: string | null, yardName?: string) => void;
}

const YardPublicContext = createContext<YardPublicContextValue | undefined>(undefined);

export function YardPublicProvider({ children }: { children: ReactNode }) {
  const [activeYardId, setActiveYardId] = useState<string | null>(null);
  const [activeYardName, setActiveYardName] = useState<string | undefined>(undefined);

  const setActiveYard = (yardId: string | null, yardName?: string) => {
    setActiveYardId(yardId);
    setActiveYardName(yardName);
  };

  return (
    <YardPublicContext.Provider value={{ activeYardId, activeYardName, setActiveYard }}>
      {children}
    </YardPublicContext.Provider>
  );
}

export function useYardPublic(): YardPublicContextValue {
  const context = useContext(YardPublicContext);
  if (!context) {
    return { activeYardId: null, setActiveYard: () => {} };
  }
  return context;
}

