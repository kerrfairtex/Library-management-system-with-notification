import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Accessibility (WCAG 2.2 AA groundwork): eslint-config-next registers the
// jsx-a11y plugin but turns on only a few of its rules. These are the
// plugin's full "recommended" set, as errors, so CI fails on a regression.
const a11yRules = Object.fromEntries(
  [
    "alt-text", "anchor-has-content", "anchor-is-valid", "aria-activedescendant-has-tabindex",
    "aria-props", "aria-proptypes", "aria-role", "aria-unsupported-elements", "autocomplete-valid",
    "click-events-have-key-events", "heading-has-content", "html-has-lang", "iframe-has-title",
    "img-redundant-alt", "interactive-supports-focus", "label-has-associated-control",
    "media-has-caption", "mouse-events-have-key-events", "no-access-key", "no-autofocus",
    "no-distracting-elements", "no-interactive-element-to-noninteractive-role",
    "no-noninteractive-element-interactions", "no-noninteractive-element-to-interactive-role",
    "no-noninteractive-tabindex", "no-redundant-roles", "no-static-element-interactions",
    "role-has-required-aria-props", "role-supports-aria-props", "scope", "tabindex-no-positive",
  ].map((rule) => [`jsx-a11y/${rule}`, "error"])
);

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["src/**/*.{ts,tsx}"], rules: a11yRules },
  globalIgnores([".next/**", "node_modules/**", "out/**", "next-env.d.ts"]),
]);
