"use client";

import * as React from "react";
import { Dialog } from "@/components/landing-ui/Dialog";
import { LeadForm, type LeadFormFields } from "@/components/LeadForm";
import { track } from "@/lib/analytics";

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
  // Останній конфіг лишається під час анімації закриття, щоб контент не зникав різко.
  const [shown, setShown] = React.useState<LeadModalConfig | null>(null);

  const openLead = React.useCallback((c: LeadModalConfig) => {
    setConfig(c);
    setShown(c);
    track("form_open", { source: c.source });
  }, []);

  const closeLead = React.useCallback(() => setConfig(null), []);

  return (
    <LeadModalContext.Provider value={{ openLead, closeLead }}>
      {children}
      <Dialog
        open={config !== null}
        onClose={closeLead}
        title={shown?.title}
        description={shown?.description}
      >
        {shown && (
          <LeadForm
            source={shown.source}
            fields={shown.fields}
            submitLabel={shown.submitLabel}
            onSuccess={closeLead}
          />
        )}
      </Dialog>
    </LeadModalContext.Provider>
  );
}
