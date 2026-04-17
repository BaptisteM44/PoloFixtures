import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/db.ts", "src/lib/auth.ts", "src/lib/mailer.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
