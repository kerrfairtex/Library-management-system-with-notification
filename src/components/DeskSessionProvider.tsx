"use client";

import { createContext, useContext } from "react";
import type { PublicUser } from "@/lib/types";
import { useApi } from "@/lib/hooks";

type Session = { user: PublicUser } | null;

const DeskSessionContext = createContext<{
  session: Session;
  loading: boolean;
  error: string | null;
  reload: () => void;
}>({
  session: null,
  loading: true,
  error: null,
  reload: () => {},
});

export function DeskSessionProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: Session;
}) {
  // Use the initialSession directly on server and during hydration
  // Don't trigger a fetch if we already have initialSession
  const { data, loading, error, reload } = useApi<{ user: PublicUser }>(
    initialSession ? null : "/api/auth/me",  // Skip fetch if we have initial data
    0,
    initialSession
  );

  return (
    <DeskSessionContext.Provider value={{ 
      session: data, 
      loading: initialSession ? false : loading,  // Not loading if we have initial data
      error, 
      reload 
    }}>
      {children}
    </DeskSessionContext.Provider>
  );
}

export function useDeskSession() {
  return useContext(DeskSessionContext);
}
