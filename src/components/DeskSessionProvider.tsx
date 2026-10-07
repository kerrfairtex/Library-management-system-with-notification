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
  const { data, loading, error, reload } = useApi<{ user: PublicUser }>(
    "/api/auth/me",
    0,
    initialSession
  );

  return (
    <DeskSessionContext.Provider value={{ session: data, loading, error, reload }}>
      {children}
    </DeskSessionContext.Provider>
  );
}

export function useDeskSession() {
  return useContext(DeskSessionContext);
}
