import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Fires on three call sites that predate this config being usable at all:
      // the `mounted` guard against hydration mismatch in mobile-menu.tsx and
      // route-card-media.tsx, and closing the menu on navigation. All three
      // work; fixing them properly means restructuring the components, which is
      // its own task. Kept visible as a warning rather than silenced, and
      // deliberately not blocking CI on day one.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static assets, not source. public/cesium/ alone is ~94 generated bundles
    // that produced 200 errors and ~12900 warnings, making `npm run lint` exit 1
    // on a clean tree and hiding the handful of real findings in our own code.
    "public/**",
  ]),
]);

export default eslintConfig;
