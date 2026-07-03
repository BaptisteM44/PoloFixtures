import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Config vitest du HARNAIS DE SIMULATION (Phase 0 refonte formats).
 *
 * Lance des tournois complets contre une DB Postgres locale jetable
 * (.simdb, port 5433) en passant par les vraies actions serveur.
 *
 * Démarrer la DB :
 *   /opt/homebrew/opt/postgresql@18/bin/pg_ctl -D .simdb -o "-p 5433 -k /tmp" start
 * Lancer l'audit :
 *   npx vitest run -c vitest.sim.config.ts
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/sim/**/*.simtest.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    // Tout tourne en séquentiel : une seule DB partagée
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      DATABASE_URL: "postgresql://sim@localhost:5433/bikepolo_sim",
      DIRECT_URL: "postgresql://sim@localhost:5433/bikepolo_sim",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
