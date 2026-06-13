"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { LeadForm, type LeadFormFields } from "@/components/LeadForm";
import { track, analyticsEvents } from "@/lib/analytics";

interface LeadModalConfig {
  title: string;
  description?: string;
  source: string;
  fields?: LeadFormFields;
  submitLabel?: string;
}

interface LeadModalContextValue {
  openLead: (config: LeadModalConfig) => void;
  closeLead: () => void;
}

const LeadModalContext = React.createContext<LeadModalContextValue | null>(null);

export function useLeadModal() {
  const ctx = React.useContext(LeadModalContext);
  if (!ctx) throw new Error("useLeadModal must be used within ModalProvider");
  return ctx;
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<LeadModalConfig | null>(null);

  const openLead = React.useCallback((c: LeadModalConfig) => {
    setConfig(c);
    track(analyticsEvents.formOpen, { source: c.source });
  }, []);

  const closeLead = React.useCallback(() => setConfig(null), []);

  return (
    <LeadModalContext.Provider value={{ openLead, closeLead }}>
      {children}
      <Dialog
        open={config !== null}
        onClose={closeLead}
        title={config?.title}
        description={config?.description}
      >
        {config && (
          <LeadForm
            source={config.source}
            fields={config.fields}
            submitLabel={config.submitLabel}
          />
        )}
      </Dialog>
    </LeadModalContext.Provider>
  );
}
