import "server-only";

import fontData from "next/dist/compiled/@next/font/dist/google/font-data.json";

import type { FontCatalog } from "@/lib/design/direction";

/** Every Google family next/font can load, with its weights, styles and subsets. */
export const GOOGLE_FONT_CATALOG = fontData as FontCatalog;
