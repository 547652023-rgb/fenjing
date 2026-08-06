import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/fenjing/",
  plugins: [react()],
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/._*"],
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
