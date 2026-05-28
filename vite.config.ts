import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react({
      babel: { babelrc: false, configFile: false },
    }),
    // Bundle analyzer — run: ANALYZE=true npm run build
    process.env.ANALYZE === "true" && visualizer({
      filename: "dist/bundle-stats.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: "treemap",
    }),
  ].filter(Boolean),
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
        pure_funcs: ["console.log", "console.warn", "console.info"],
        unsafe_arrows: true,
        unsafe_methods: true,
      },
      mangle: { safari10: true },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("jspdf") || id.includes("xlsx")) return "vendor-export";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("/zod/")) return "vendor-forms";
          if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("date-fns")) return "vendor-date";
          return "vendor";
        },
        // Consistent chunk naming for long-term caching
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 800,
    sourcemap: false,
    // Inline small assets as base64 to save HTTP requests
    assetsInlineLimit: 8192,
    // Remove unused CSS
    cssCodeSplit: true,
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
      "lucide-react",
      "clsx",
      "tailwind-merge",
    ],
    // Force re-bundle when firebase changes (avoids stale dep cache)
    force: false,
  },
  // Faster dev server HMR
  server: {
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/firebase/config.ts",
        "./src/services/index.ts",
      ],
    },
  },
});
