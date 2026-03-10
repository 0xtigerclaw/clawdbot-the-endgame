import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
    "*.log",
    "**/*.log",
    "check_*.{ts,js}",
    "debug_*.ts",
    "test_*.{ts,js}",
    "trace_*.ts",
    "monitor_*.ts",
    "clear_all_tasks*.ts",
    "count_tasks.ts",
  ]),
]);

export default eslintConfig;
