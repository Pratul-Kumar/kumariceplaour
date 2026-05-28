import { useEffect, useState } from "react";
import { settingsService } from "@/services";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    settingsService.get("theme").then((s) => {
      const saved = (s?.value as "light" | "dark") || "dark";
      setTheme(saved);
      document.documentElement.classList.toggle("dark", saved === "dark");
    });
  }, []);

  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    await settingsService.set("theme", next);
  };

  return { theme, toggleTheme };
}
