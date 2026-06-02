import { useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { useAuthStore } from "@/store/useAuthStore";

// Lazy-load page components for code splitting
const Login = lazy(() => import("@/pages/Login").then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })));
const StaffManagement = lazy(() => import("@/pages/StaffManagement").then(m => ({ default: m.StaffManagement })));
const MoneyProfile = lazy(() => import("@/pages/MoneyProfile").then(m => ({ default: m.MoneyProfile })));
const SalaryProfile = lazy(() => import("@/pages/SalaryProfile").then(m => ({ default: m.SalaryProfile })));
const AttendanceManagement = lazy(() => import("@/pages/AttendanceManagement").then(m => ({ default: m.AttendanceManagement })));
const ExpenseManagement = lazy(() => import("@/pages/ExpenseManagement").then(m => ({ default: m.ExpenseManagement })));
const SalaryManagement = lazy(() => import("@/pages/SalaryManagement").then(m => ({ default: m.SalaryManagement })));
const Analytics = lazy(() => import("@/pages/Analytics").then(m => ({ default: m.Analytics })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));
const HistoryReports = lazy(() => import("@/pages/HistoryReports").then(m => ({ default: m.HistoryReports })));

const FullPageLoader = ({ message = "Connecting to Cloud..." }: { message?: string }) => (
  <div className="h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
    {/* Ambient background glows */}
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[120px] animate-pulse delay-700" />
    
    <div className="flex flex-col items-center gap-6 relative z-10">
      {/* Premium Multi-Ring Spinner & Logo Container */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Outer glowing gradient ring */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 border-r-violet-500 animate-spin" style={{ animationDuration: '1.5s' }} />
        
        {/* Inner reverse-rotating ring */}
        <div className="absolute inset-2 rounded-full border border-transparent border-b-cyan-400 border-l-pink-500 animate-spin" style={{ animationDuration: '1s', animationDirection: 'reverse' }} />
        
        {/* Central glowing core logo */}
        <div className="relative w-14 h-14 rounded-full bg-card/40 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-inner animate-pulse">
          <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
        </div>
      </div>

      {/* Elegant Typography and Loading Message */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-xs font-bold text-foreground/80 uppercase tracking-[0.25em] animate-pulse">{message}</p>
        <span className="text-[10px] text-muted-foreground/60 tracking-wider">Please wait a moment</span>
      </div>
    </div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { initializeAuth } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) { initialized.current = true; initializeAuth(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={
                    <div className="h-[50vh] w-full flex items-center justify-center">
                      <div className="flex flex-col items-center gap-4 animate-pulse">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 border-r-violet-500 animate-spin" style={{ animationDuration: '1.2s' }} />
                          <div className="relative w-9 h-9 rounded-full bg-card/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em]">Loading Module...</p>
                      </div>
                    </div>
                  }>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/staff" element={<StaffManagement />} />
                      <Route path="/money/:id" element={<MoneyProfile />} />
                      <Route path="/salary/:id" element={<SalaryProfile />} />
                      <Route path="/attendance" element={<AttendanceManagement />} />
                      <Route path="/expenses" element={<ExpenseManagement />} />
                      <Route path="/salary" element={<SalaryManagement />} />
                      <Route path="/analytics" element={<Analytics />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/history" element={<HistoryReports />} />
                      {/* Redirect temp-staff to staff (was causing 404 from nav) */}
                      <Route path="/temp-staff" element={<Navigate to="/staff" replace />} />
                      {/* Catch-all: redirect unknown paths to dashboard */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}
