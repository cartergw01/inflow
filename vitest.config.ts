import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Fixture helpers live in __tests__ too, so only *.test.ts files are
    // collected as suites.
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
  },
});
