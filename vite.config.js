import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, "/");
          if (norm.includes("/node_modules/ethers/")) return "ethers";
          if (norm.includes("/node_modules/lucide-react/")) return "icons";
          if (
            norm.includes("/node_modules/react/") ||
            norm.includes("/node_modules/react-dom/") ||
            norm.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
        }
      }
    }
  }
});