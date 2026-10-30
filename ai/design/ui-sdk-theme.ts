/**
 * How a new project's stylesheet meets ui-sdk. The components carry behaviour
 * only; `@ui-sdk/core/web.css` gives each one a plain working look drawn from
 * its `--ui-*` variables. The scaffold imports it below Tailwind's utilities, so
 * any class on a control wins; the builder sets those variables for its design.
 */

/** The ui-sdk layer is declared first so project styles beat its behaviour CSS; its look sits in `components`, under utilities. */
export const STYLESHEET_IMPORTS = [
  "@layer ui-sdk;",
  "",
  '@import "tailwindcss";',
  '@import "@ui-sdk/core/web.css" layer(components);',
];

/** ui-sdk's stylesheet underlines and recolors every link; page links keep the look the page gives them. */
export const LINK_RESET = [
  "@layer components {",
  "  a:not([data-slot]) {",
  "    color: inherit;",
  "    text-decoration: inherit;",
  "  }",
  "}",
];

/** The control height a direction gets when it names none. */
export const DEFAULT_CONTROL_HEIGHT_PX = 40;
