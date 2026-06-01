import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Receipt, IndianRupee, CalendarOff,
  Settings, X, Menu, TrendingUp, ClipboardCheck, LogOut,
  Cloud, CloudOff, History, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { auth } from "@/firebase/config";
import { signOut } from "firebase/auth";
import { PoweredByFooter } from "@/components/PoweredByFooter";

const NAV_ITEMS = [
  { to: "/",          icon: LayoutDashboard, label: "Dashboard",  color: "from-violet-500 to-indigo-500" },
  { to: "/staff",     icon: Users,           label: "Staff",      color: "from-blue-500 to-cyan-500" },
  { to: "/attendance",icon: ClipboardCheck,  label: "Attendance", color: "from-emerald-500 to-teal-500" },
  { to: "/expenses",  icon: Receipt,         label: "Expenses",   color: "from-rose-500 to-pink-500" },
  { to: "/analytics", icon: TrendingUp,      label: "Analytics",  color: "from-purple-500 to-violet-500" },
];

const NavItem = memo(function NavItem({
  to, icon: Icon, label, color,
  onClick
}: typeof NAV_ITEMS[0] & { onClick: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 select-none",
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active left accent line */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-primary" />
          )}

          {/* Icon with flat bg when active */}
          <span className={cn(
            "relative z-10 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md transition-all duration-150",
            isActive
              ? "bg-primary/10 text-primary"
              : "bg-transparent group-hover:bg-muted"
          )}>
            <Icon className="h-4 w-4" />
          </span>

          <span className="relative z-10 flex-1">{label}</span>

          {isActive && (
            <ChevronRight className="relative z-10 h-3 w-3 text-muted-foreground" />
          )}
        </>
      )}
    </NavLink>
  );
});

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const currentPage = useMemo(
    () => NAV_ITEMS.find((n) => n.to === location.pathname)?.label || "Dashboard",
    [location.pathname]
  );

  const dateStr = useMemo(
    () => new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" }),
    []
  );

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const handleLogout = useCallback(() => signOut(auth), []);
  const closeSidebar  = useCallback(() => setSidebarOpen(false), []);

  const userInitial = user?.email?.charAt(0).toUpperCase() || "A";
  const userName    = user?.email?.split("@")[0] || "Admin";

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Overlay ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 z-50 flex flex-col transition-transform duration-300 ease-out border-r border-border bg-card",
        "lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}
      >
        {/* ── Logo ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 flex-shrink-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-muted border border-border">
                <img src="/logo.png" alt="Logo" className="w-6.5 h-6.5 object-contain" />
              </div>
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Kumar Ice</h1>
              <p className="text-[10px] font-medium text-muted-foreground/60">
                Business Manager
              </p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Nav ───────────────────────────────────────────── */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-0.5 scrollbar-hide">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
            Navigation
          </p>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} onClick={closeSidebar} />
          ))}
        </nav>

        {/* ── Bottom ────────────────────────────────────────── */}
        <div className="px-2.5 pb-4 pt-3"
          style={{ borderTop: "1px solid var(--glass-border)" }}
        >
          {/* User / logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-muted border border-border"
          >
            <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-foreground truncate">{userName}</p>
              <p className="text-[10px] text-muted-foreground">Sign out</p>
            </div>
            <LogOut className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ───────────────────────────────────────── */}
        <header
          className="flex items-center justify-between px-4 py-3 sticky top-0 z-30 flex-shrink-0 bg-background/80 border-b border-border backdrop-blur-md"
        >
          {/* Left: Hamburger + Page title */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 ml-1">
              <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain lg:hidden" />
              <div>
                <h2 className="text-sm font-bold text-foreground leading-tight">{currentPage}</h2>
                <p className="text-[10px] text-muted-foreground hidden sm:block">{dateStr}</p>
              </div>
            </div>
          </div>

          {/* Right: Avatar */}
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-primary text-xs font-bold transition-colors hover:bg-muted border border-border bg-primary/10"
            >
              {userInitial}
            </button>
          </div>
        </header>

        {/* ── Page Content ──────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto flex flex-col justify-between">
          <div className="p-4 sm:p-5 pb-24 lg:pb-6 animate-fade-in max-w-7xl mx-auto w-full flex-grow">
            {children}
          </div>
          <PoweredByFooter className="pb-28 lg:pb-6" />
        </main>
      </div>

      {/* ── Mobile Bottom Nav ──────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden pb-safe"
        style={{
          background: "hsl(var(--background) / 0.96)",
          backdropFilter: "blur(24px)",
          borderTop: "1px solid var(--glass-border)",
        }}
      >
        <div className="flex items-center justify-around px-1 py-1.5">
          {NAV_ITEMS.slice(0, 4).map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all duration-150 min-w-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "w-9 h-7 flex items-center justify-center rounded-md transition-all duration-150",
                    isActive ? "bg-primary/10" : "bg-transparent"
                  )}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <span className="text-[9px] font-semibold truncate">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* More button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <div className="w-9 h-7 flex items-center justify-center rounded-md">
              <Menu className="h-[18px] w-[18px]" />
            </div>
            <span className="text-[9px] font-semibold">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
