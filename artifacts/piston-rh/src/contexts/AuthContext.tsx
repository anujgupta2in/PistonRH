import { createContext, useContext } from "react";
import type { UserProfile } from "@workspace/api-client-react";

export type AuthContextType = {
  user: UserProfile | undefined;
  isLoading: boolean;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
