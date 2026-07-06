import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AuthContext, useAuth } from "@/contexts/AuthContext";
import { VesselContext, useVesselContext } from "@/contexts/VesselContext";
import {
  useGetMe,
  useLogout,
  useListVessels,
  getGetMeQueryKey,
  getListVesselsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Loader2, ShieldAlert } from "lucide-react";

import LoginPage from "@/pages/login";
import SetupPage from "@/pages/setup";
import Dashboard from "@/pages/dashboard";
import MonthlyRh from "@/pages/monthly-rh";
import Components from "@/pages/components";
import Movements from "@/pages/movements";
import Cylinders from "@/pages/cylinders";
import Alerts from "@/pages/alerts";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import ImportPage from "@/pages/import";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const logoutMutation = useLogout();
  const qc = useQueryClient();

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        qc.clear();
        window.location.assign("/login");
      },
    });
  };

  return <AuthContext.Provider value={{ user, isLoading, logout }}>{children}</AuthContext.Provider>;
}

function VesselProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: vessels, isLoading: isVesselsLoading } = useListVessels({
    query: { enabled: !!user, retry: false, queryKey: getListVesselsQueryKey() },
  });

  const storageKey = user ? `pistonrh:activeVesselId:${user.id}` : null;
  const [activeVesselId, setActiveVesselIdState] = React.useState<number | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (!vessels || !storageKey) return;
    const stored = Number(localStorage.getItem(storageKey));
    const validStored = vessels.some((v) => v.id === stored) ? stored : null;
    setActiveVesselIdState(validStored ?? vessels[0]?.id ?? null);
    setHydrated(true);
  }, [vessels, storageKey]);

  const setActiveVesselId = (id: number) => {
    setActiveVesselIdState(id);
    if (storageKey) localStorage.setItem(storageKey, String(id));
  };

  return (
    <VesselContext.Provider
      value={{
        activeVesselId,
        setActiveVesselId,
        isLoading: isVesselsLoading || !hydrated,
      }}
    >
      {children}
    </VesselContext.Provider>
  );
}

function NoVesselAccess() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="items-center text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground mb-2" />
          <CardTitle>No Vessel Access</CardTitle>
          <CardDescription>
            You don't have access to any vessel yet. Contact your Technical Office administrator to be
            granted access.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}

function AppContent() {
  const { user } = useAuth();
  const { activeVesselId, isLoading } = useVesselContext();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!activeVesselId) {
    return user?.role === "technical_office" ? <SetupPage /> : <NoVesselAccess />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/monthly-rh" component={MonthlyRh} />
        <Route path="/components" component={Components} />
        <Route path="/movements" component={Movements} />
        <Route path="/cylinders" component={Cylinders} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route path="/import" component={ImportPage} />
        {/* Legacy valve routes redirect to merged pages */}
        <Route path="/valve-dashboard"><Redirect to="/" /></Route>
        <Route path="/valve-components"><Redirect to="/components" /></Route>
        <Route path="/valve-movements"><Redirect to="/movements" /></Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Switch>
              <Route path="/login" component={LoginPage} />
              <Route>
                <ProtectedRoute>
                  <VesselProvider>
                    <AppContent />
                  </VesselProvider>
                </ProtectedRoute>
              </Route>
            </Switch>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
