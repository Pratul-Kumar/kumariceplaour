import { useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { useAuthStore } from "@/store/useAuthStore";

// Lazy-load page components for code splitting
const Login = lazy(() => import("@/pages/Login").then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })));
const StaffManagement = lazy(() => import("@/pages/StaffManagement").then(m => ({ default: m.StaffManagement })));
const StaffProfile = lazy(() => import("@/pages/StaffProfile").then(m => ({ default: m.StaffProfile })));
const AttendanceManagement = lazy(() => import("@/pages/AttendanceManagement").then(m => ({ default: m.AttendanceManagement })));
const ExpenseManagement = lazy(() => import("@/pages/ExpenseManagement").then(m => ({ default: m.ExpenseManagement })));
const SalaryManagement = lazy(() => import("@/pages/SalaryManagement").then(m => ({ default: m.SalaryManagement })));
const LeaveManagement = lazy(() => import("@/pages/LeaveManagement").then(m => ({ default: m.LeaveManagement })));
const Analytics = lazy(() => import("@/pages/Analytics").then(m => ({ default: m.Analytics })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));
const HistoryReports = lazy(() => import("@/pages/HistoryReports").then(m => ({ default: m.HistoryReports })));

const FullPageLoader = ({ message = "Connecting to Cloud..." }: { message?: string }) => (
  <div className="h-screen w-full flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-5">
      {/* Logo with neon ring */}
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 opacity-25 blur-xl scale-110" />
        <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
        </div>
      </div>
      {/* Neon spinner */}
      <div className="animate-spin rounded-full h-7 w-7"
        style={{ border: "2px solid rgba(99,102,241,0.15)", borderTopColor: "#6366f1", boxShadow: "0 0 12px rgba(99,102,241,0.5)" }}
      />
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{message}</p>
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
                      <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6"
                          style={{ border: "2px solid rgba(99,102,241,0.15)", borderTopColor: "#6366f1", boxShadow: "0 0 10px rgba(99,102,241,0.4)" }}
                        />
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Loading...</p>
                      </div>
                    </div>
                  }>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/staff" element={<StaffManagement />} />
                      <Route path="/staff/:id" element={<StaffProfile />} />
                      <Route path="/attendance" element={<AttendanceManagement />} />
                      <Route path="/expenses" element={<ExpenseManagement />} />
                      <Route path="/salary" element={<SalaryManagement />} />
                      <Route path="/leaves" element={<LeaveManagement />} />
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
