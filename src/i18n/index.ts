import { en } from "./en";
import type { Locale } from "./en";

/**
 * Only "en" ships today. Adding a language means adding `<code>.ts` here
 * (matching the `Locale` shape from en.ts) and registering it below.
 */
const locales = { en } satisfies Record<string, Locale>;

type LocaleCode = keyof typeof locales;

const DEFAULT_LOCALE: LocaleCode = "en";

export function getLocale(code: LocaleCode = DEFAULT_LOCALE): Locale {
  return locales[code] ?? locales[DEFAULT_LOCALE];
}

export const t = getLocale();
export type { Locale };
