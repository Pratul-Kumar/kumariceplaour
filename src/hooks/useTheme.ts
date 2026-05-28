import { useEffect, useState } from "react";

type Theme = "light" | "dark";

let currentTheme: Theme = (localStorage.getItem("theme") as Theme) || "dark";
const listeners = new Set<(theme: Theme) => void>();

const updateTheme = (next: Theme) => {
  currentTheme = next;
  if (typeof window !== "undefined") {
    document.documentElement.classList.toggle("dark", next === "dark");
  }
  localStorage.setItem("theme", next);
  listeners.forEach(fn => fn(next));
};

// Initialize class on load synchronously
if (typeof window !== "undefined") {
  document.documentElement.classList.toggle("dark", currentTheme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    setTheme(currentTheme);
    const handler = (nextTheme: Theme) => setTheme(nextTheme);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    updateTheme(next);
  };

  return { theme, toggleTheme };
}
