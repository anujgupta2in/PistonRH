import { Link, useLocation } from "wouter";
import { useVesselContext } from "@/contexts/VesselContext";
import { useAuth } from "@/contexts/AuthContext";
import { useListVessels } from "@workspace/api-client-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Calendar,
  Wrench,
  ArrowRightLeft,
  Database,
  BellRing,
  FileBarChart,
  Settings,
  Ship,
  FileUp,
  User,
  LogOut,
  LifeBuoy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { activeVesselId, setActiveVesselId, isLoading: isVesselLoading } = useVesselContext();
  const { user, logout } = useAuth();
  const { data: vessels } = useListVessels();

  const handleVesselChange = (vesselId: string) => {
    setActiveVesselId(parseInt(vesselId));
  };

  const menuItems = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/" },
    { title: "Monthly RH", icon: Calendar, href: "/monthly-rh" },
    { title: "Components", icon: Wrench, href: "/components" },
    { title: "Movements", icon: ArrowRightLeft, href: "/movements" },
    { title: "Cylinders", icon: Database, href: "/cylinders" },
    { title: "Alerts", icon: BellRing, href: "/alerts" },
    { title: "Reports", icon: FileBarChart, href: "/reports" },
    { title: "Settings", icon: Settings, href: "/settings" },
    { title: "Import Setup", icon: FileUp, href: "/import" },
    { title: "Help", icon: LifeBuoy, href: "/help" },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background font-sans">
        <Sidebar className="border-r border-sidebar-border shadow-sm">
          <SidebarHeader className="p-4 border-b border-sidebar-border/50 bg-sidebar">
            <div className="flex items-center gap-2 mb-4 px-2">
              <div className="bg-primary/20 p-1.5 rounded text-primary">
                <Ship size={20} />
              </div>
              <div className="font-bold text-xs tracking-tight text-sidebar-foreground leading-tight">
                ME Components<br /><span className="text-primary">RH Records</span>
              </div>
            </div>
            
            {isVesselLoading ? (
              <Skeleton className="h-10 w-full bg-sidebar-accent" />
            ) : (
              <Select 
                value={activeVesselId?.toString() || ""} 
                onValueChange={handleVesselChange}
              >
                <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-10 shadow-none">
                  <SelectValue placeholder="Select Vessel" />
                </SelectTrigger>
                <SelectContent>
                  {vessels?.map((v) => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      {v.vesselName} {v.imoNumber ? `(${v.imoNumber})` : ""}
                    </SelectItem>
                  ))}
                  {vessels?.length === 0 && (
                    <SelectItem value="none" disabled>No vessels configured</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </SidebarHeader>
          <SidebarContent className="bg-sidebar p-2">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
                    className="h-10 transition-colors"
                  >
                    <Link href={item.href} className="flex items-center gap-3 px-3">
                      <item.icon size={18} className="opacity-70" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-2 bg-sidebar border-t border-sidebar-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 h-auto py-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                    <User size={14} />
                  </div>
                  <div className="text-left overflow-hidden">
                    <div className="text-xs font-medium truncate">{user?.fullName}</div>
                    <div className="text-[10px] text-sidebar-foreground/50 truncate">
                      {user?.role === "technical_office" ? "Technical Office" : "Vessel Officer"}
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 border-b bg-card flex items-center gap-3 px-4 shrink-0 lg:hidden">
            <SidebarTrigger />
            <div className="font-bold text-sm tracking-tight">ME Components <span className="text-primary">RH Records</span></div>
          </header>
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
