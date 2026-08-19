import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: true,           // allow external access
    port: 8080,
    strictPort: true,     // optional, ensures Vite doesn’t change port
    allowedHosts: [
      "8dc9211ff2be.ngrok-free.app",
      ".ngrok-free.app",  // wildcard for subdomains
    ],
    // S3 serves the task photos publicly, but its bucket CORS policy does not allow the
    // localhost app to read them into jsPDF. Proxy only this bucket path in development so
    // PDF generation can embed the photos without changing the production API contract.
    proxy: {
      "/__task-media": {
        target: "https://sbr-task-media-prod.s3.amazonaws.com",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__task-media/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/__task-media": {
        target: "https://sbr-task-media-prod.s3.amazonaws.com",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__task-media/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
