// components/ambient/PersonPanelProvider.tsx
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import PersonPanel from "@/components/ambient/PersonPanel";

type PersonPanelContextValue = {
  openPanel: (leadId: string) => void;
  closePanel: () => void;
  activeLeadId: string | null;
};

const PersonPanelContext = createContext<PersonPanelContextValue>({
  openPanel: () => {},
  closePanel: () => {},
  activeLeadId: null,
});

export function usePersonPanel() {
  return useContext(PersonPanelContext);
}

export default function PersonPanelProvider({ children }: { children: ReactNode }) {
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const openPanel = useCallback((leadId: string) => {
    setActiveLeadId(leadId);
  }, []);

  const closePanel = useCallback(() => {
    setActiveLeadId(null);
  }, []);

  return (
    <PersonPanelContext.Provider value={{ openPanel, closePanel, activeLeadId }}>
      {children}
      <PersonPanel leadId={activeLeadId} onClose={closePanel} />
    </PersonPanelContext.Provider>
  );
}
