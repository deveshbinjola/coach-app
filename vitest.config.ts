// Vitest config — pure-logic tests for the lib/ business rules.
//
// Scope choice: node environment, NOT jsdom. The four files under test
// (lead-score, lead-sla, voice-trust, pushback) are all pure functions
// over plain data — no DOM, no React, no Next.js runtime. Keeping the
// environment lean keeps the suite fast and reduces flake surface.
//
// Path alias `@/*` mirrors tsconfig.json so test files can import lib
// files exactly the way production code does — `import {...} from
// "@/lib/lead-score"` — instead of fragile relative paths.

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals:     false,
    include:     ["lib/**/*.test.ts", "lib/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include:  ["lib/lead-score.ts", "lib/lead-sla.ts", "lib/voice-trust.ts", "lib/pushback.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
