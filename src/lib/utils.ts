import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, symbol = "₹") {
  return `${symbol}${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr?: string, fmt = "dd MMM yyyy") {
  if (!dateStr) return "N/A";
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

export function formatMonth(monthStr?: string) {
  if (!monthStr) return "N/A";
  try {
    return format(parseISO(`${monthStr}-01`), "MMMM yyyy");
  } catch {
    return monthStr;
  }
}

export function getCurrentMonth() {
  return format(new Date(), "yyyy-MM");
}

export function getMonthRange(month: string) {
  const date = parseISO(`${month}-01`);
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function generateAvatarColor(name: string) {
  const colors = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-orange-500 to-amber-600",
    "from-pink-500 to-rose-600",
    "from-indigo-500 to-blue-600",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function getLast12Months() {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1); // Set to 1st to prevent month overflow (e.g., Feb 28/29)
    d.setMonth(d.getMonth() - i);
    months.push(format(d, "yyyy-MM"));
  }
  return months;
}
