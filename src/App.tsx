import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { Dashboard } from "@/pages/Dashboard";
import { StaffManagement } from "@/pages/StaffManagement";
import { StaffProfile } from "@/pages/StaffProfile";
import { AttendanceManagement } from "@/pages/AttendanceManagement";
import { ExpenseManagement } from "@/pages/ExpenseManagement";
import { SalaryManagement } from "@/pages/SalaryManagement";
import { LeaveManagement } from "@/pages/LeaveManagement";
import { TempStaffManagement } from "@/pages/TempStaffManagement";
import { Analytics } from "@/pages/Analytics";
import { Settings } from "@/pages/Settings";

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/staff" element={<StaffManagement />} />
            <Route path="/staff/:id" element={<StaffProfile />} />
            <Route path="/attendance" element={<AttendanceManagement />} />
            <Route path="/expenses" element={<ExpenseManagement />} />
            <Route path="/salary" element={<SalaryManagement />} />
            <Route path="/leaves" element={<LeaveManagement />} />
            <Route path="/temp-staff" element={<TempStaffManagement />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  );
}
