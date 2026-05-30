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
  { to: "/salary",    icon: IndianRupee,     label: "Salary",     color: "from-amber-500 to-orange-500" },
  { to: "/analytics", icon: TrendingUp,      label: "Analytics",  color: "from-purple-500 to-violet-500" },
  { to: "/history",   icon: History,         label: "History",    color: "from-slate-400 to-slate-500" },
  { to: "/settings",  icon: Settings,        label: "Settings",   color: "from-gray-400 to-gray-500" },
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
          "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isActive
            ? "text-white"
            : "text-muted-foreground hover:text-foreground hover:bg-glass-bg"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active background */}
          {isActive && (
            <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/10 border border-indigo-500/25" />
          )}
          {/* Active left accent */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-gradient-to-b from-indigo-400 to-violet-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          )}

          {/* Icon with gradient bg when active */}
          <span className={cn(
            "relative z-10 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200",
            isActive
              ? `bg-gradient-to-br ${color} shadow-lg`
              : "bg-glass-bg group-hover:bg-glass-bg"
          )}>
            <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground")} />
          </span>

          <span className="relative z-10 flex-1">{label}</span>

          {isActive && (
            <ChevronRight className="relative z-10 h-3.5 w-3.5 text-indigo-400 opacity-60" />
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
        "fixed top-0 left-0 h-full w-64 z-50 flex flex-col transition-transform duration-300 ease-out",
        "lg:relative lg:translate-x-0",
        // Glass sidebar
        "border-r",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "bg-card/95"
      )}
        style={{
          borderColor: "var(--glass-border)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* ── Logo ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--glass-bg)" }}
        >
          <div className="flex items-center gap-3">
            {/* Logo ring with glow */}
            <div className="relative w-10 h-10 flex-shrink-0">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 opacity-20 blur-md" />
              <div className="relative w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
              >
                <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain" />
              </div>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Kumar Ice</h1>
              <p className="text-[10px] font-medium text-muted-foreground/60">
                Business Manager
              </p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-glass-bg transition-colors"
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
        <div className="px-2.5 pb-4 pt-3 space-y-2"
          style={{ borderTop: "1px solid var(--glass-bg)" }}
        >
          {/* Sync status */}
          {isOnline ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}
            >
              <span className="dot-online flex-shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Cloud Sync Active
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl animate-pulse"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <CloudOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Offline Mode
              </span>
            </div>
          )}

          {/* User / logout */}
          <button
            onClick={handleLogout}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-red-500/8 press-effect"
            style={{ border: "1px solid var(--glass-border)" }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 group-hover:from-red-500 group-hover:to-rose-600 transition-all duration-200">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-foreground group-hover:text-red-300 truncate transition-colors">{userName}</p>
              <p className="text-[10px] text-muted-foreground group-hover:text-red-400 transition-colors">Sign out</p>
            </div>
            <LogOut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-red-400 transition-colors flex-shrink-0" />
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ───────────────────────────────────────── */}
        <header
          className="flex items-center justify-between px-4 py-3 sticky top-0 z-30 flex-shrink-0 bg-background/85"
          style={{
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--glass-border)",
          }}
        >
          {/* Left: Hamburger + Page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-xl text-muted-foreground hover:text-white transition-colors press-effect"
              style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
            >
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
                <Menu className="h-4 w-4" />
              </div>
            </button>

            <div>
              <h2 className="text-sm font-bold text-white leading-tight">{currentPage}</h2>
              <p className="text-[10px] text-muted-foreground hidden sm:block">{dateStr}</p>
            </div>
          </div>

          {/* Right: Status chips */}
          <div className="flex items-center gap-2">
            {isOnline ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}
              >
                <span className="dot-online" />
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Live</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <CloudOff className="h-3 w-3 text-red-400" />
                <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Offline</span>
              </div>
            )}

            {/* Avatar */}
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold transition-all duration-200 hover:scale-110 press-effect bg-gradient-to-br from-violet-500 to-indigo-600"
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
          {NAV_ITEMS.slice(0, 4).map(({ to, icon: Icon, label, color }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-0 press-effect",
                  isActive ? "text-white" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "w-9 h-7 flex items-center justify-center rounded-lg transition-all duration-200",
                    isActive ? `bg-gradient-to-br ${color} shadow-lg` : "bg-transparent"
                  )}>
                    <Icon className={cn("h-[18px] w-[18px]", isActive ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <span className={cn(
                    "text-[9px] font-semibold truncate transition-colors",
                    isActive ? "text-white" : "text-muted-foreground"
                  )}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* More button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-muted-foreground press-effect"
          >
            <div className="w-9 h-7 flex items-center justify-center rounded-lg">
              <Menu className="h-[18px] w-[18px]" />
            </div>
            <span className="text-[9px] font-semibold">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
