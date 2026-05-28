import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    target: "es2020",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
    },
    rollupOptions: {
      output: {
        // Vite 8 / Rolldown requires manualChunks as a function
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) return "vendor-firebase";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("jspdf") || id.includes("xlsx")) return "vendor-export";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("/zod/")) return "vendor-forms";
            if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("date-fns")) return "vendor-date";
            // All other node_modules go into a common vendor chunk
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "zustand",
    ],
  },
});
