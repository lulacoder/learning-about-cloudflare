import { createContext, useContext, useState, type ReactNode } from "react";
import { listChats } from "./api";

const STORAGE_KEY = "stillroom-preview-token";

type AuthContextValue = {
  token: string;
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? "");

  async function connect(candidate: string) {
    const next = candidate.trim();
    await listChats(next);
    sessionStorage.setItem(STORAGE_KEY, next);
    setToken(next);
  }

  function disconnect() {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken("");
  }

  return (
    <AuthContext.Provider value={{ token, connect, disconnect }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
