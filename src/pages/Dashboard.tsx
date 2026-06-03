import { useNavigate } from "react-router-dom";
import { Users, Clock, Receipt, IndianRupee, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui";

const NAV_ITEMS = [
  { path: "/attendance", label: "Attendance", icon: Clock, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { path: "/staff", label: "Staff", icon: Users, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  { path: "/staff?mode=salary", label: "Salary", icon: IndianRupee, color: "text-blue-500", bg: "bg-blue-500/10" },
  { path: "/staff?mode=money", label: "Dues", icon: Wallet, color: "text-amber-500", bg: "bg-amber-500/10" },
  { path: "/expenses", label: "Expense", icon: Receipt, color: "text-rose-500", bg: "bg-rose-500/10" },
];

export function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 pb-10 pt-2">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Kumar Ice Parlour</h1>
        <p className="text-sm text-muted-foreground mt-1.5 font-medium">Select a module to manage</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
        {NAV_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const isLastOdd = i === NAV_ITEMS.length - 1 && NAV_ITEMS.length % 2 !== 0;
          return (
            <Card
              key={item.label + i}
              onClick={() => navigate(item.path)}
              className={`cursor-pointer hover:scale-[1.02] active:scale-95 transition-all duration-200 border border-border/60 shadow-sm rounded-2xl overflow-hidden ${
                isLastOdd ? "sm:col-span-2" : ""
              }`}
            >
              <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-3">
                <div className={`p-3.5 rounded-2xl ${item.bg} ${item.color}`}>
                  <Icon className="h-7 w-7" strokeWidth={2.25} />
                </div>
                <p className="text-lg font-semibold text-foreground tracking-tight">{item.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
