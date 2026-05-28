import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { useAuthStore } from "@/store/useAuthStore";
import { Loader2 } from "lucide-react";

// Lazy-load page components
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-slate-500 font-medium">Connecting to Cloud...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={
          <div className="h-screen w-full flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-slate-500 font-medium">Connecting to Cloud...</p>
            </div>
          </div>
        }>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/*" element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={
                    <div className="h-[50vh] w-full flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-slate-500 font-medium">Loading page...</p>
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
