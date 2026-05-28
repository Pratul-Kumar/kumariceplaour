import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Receipt, IndianRupee, CalendarOff,
  HardHat, Settings, X, Menu, TrendingUp, Bell, Sun, Moon, ClipboardCheck, LogOut, Cloud, CloudOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/store/useAuthStore";
import { auth } from "@/firebase/config";
import { signOut } from "firebase/auth";

const NAV_ITEMS = [
  { to: "/",          icon: LayoutDashboard, label: "Dashboard" },
  { to: "/staff",     icon: Users,           label: "Staff" },
  { to: "/attendance",icon: ClipboardCheck,  label: "Attendance" },
  { to: "/expenses",  icon: Receipt,         label: "Expenses" },
  { to: "/salary",    icon: IndianRupee,     label: "Salary" },
  { to: "/leaves",    icon: CalendarOff,     label: "Leaves" },
  { to: "/temp-staff",icon: HardHat,         label: "Temp Staff" },
  { to: "/analytics", icon: TrendingUp,      label: "Analytics" },
  { to: "/settings",  icon: Settings,        label: "Settings" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const { user } = useAuthStore();

  const currentPage = useMemo(
    () => NAV_ITEMS.find((n) => n.to === location.pathname)?.label || "Dashboard",
    [location.pathname]
  );
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // Pre-compute the date string once per day (changes at midnight via memo)
  const dateStr = useMemo(
    () => new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // computed once on mount; date won't change during a session
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-50 flex flex-col bg-card border-r border-border transition-transform duration-300 ease-out",
          "lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg text-lg">
              🍦
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Kumar Ice</h1>
              <p className="text-[10px] text-muted-foreground">Parlour Manager</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-border space-y-3">
          {isOnline ? (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Cloud className="w-4 h-4" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Cloud Sync Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-destructive/15 text-destructive border border-destructive/30 dark:bg-destructive/20 dark:text-red-400 animate-pulse">
              <CloudOff className="w-4 h-4" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Offline - Local Mode</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 group hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer" onClick={handleLogout}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold group-hover:from-red-500 group-hover:to-red-600">
              {user?.email?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate group-hover:text-red-600">{user?.email?.split('@')[0] || 'Admin'}</p>
              <p className="text-[10px] text-muted-foreground truncate group-hover:text-red-500">Log out</p>
            </div>
            <LogOut className="w-4 h-4 text-muted-foreground group-hover:text-red-500" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-muted-foreground hover:text-foreground lg:hidden p-2 rounded-lg hover:bg-accent transition-colors active:bg-accent/80"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow text-sm shrink-0">
                  🍦
                </div>
              </div>
            </button>
            <div>
              <h2 className="text-base font-semibold text-foreground">{currentPage}</h2>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {dateStr}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className="p-4 sm:p-6 animate-fade-in max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-card/95 backdrop-blur-sm border-t border-border pb-safe">
        <div className="flex items-center justify-around px-1 py-1">
          {NAV_ITEMS.slice(0, 4).map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200 min-w-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn("p-1.5 rounded-lg transition-all duration-200", isActive && "bg-primary/15")}>
                    <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <span className={cn("text-[9px] font-medium truncate", isActive ? "text-primary" : "text-muted-foreground")}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-muted-foreground"
          >
            <div className="p-1.5 rounded-lg">
              <Menu className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
