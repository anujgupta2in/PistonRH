import { createContext, useContext } from "react";

export type VesselContextType = {
  activeVesselId: number | null;
  setActiveVesselId: (id: number) => void;
  isLoading: boolean;
};

export const VesselContext = createContext<VesselContextType | undefined>(undefined);

export function useVesselContext() {
  const context = useContext(VesselContext);
  if (context === undefined) {
    throw new Error("useVesselContext must be used within a VesselProvider");
  }
  return context;
}
