import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type Preferences = {
  completionSound: boolean;
  completionNotification: boolean;
  earlyAccess: boolean;
  productEmails: boolean;
  allowShowcase: boolean;
  reduceMotion: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  completionSound: true,
  completionNotification: false,
  earlyAccess: false,
  productEmails: true,
  allowShowcase: true,
  reduceMotion: false,
};

const storedPreferencesAtom = atomWithStorage<Partial<Preferences>>("bloom:preferences", {});

/** Per-device preferences. They load after hydration, so the first render always uses the defaults. */
export const preferencesAtom = atom(
  (get) => ({ ...DEFAULT_PREFERENCES, ...get(storedPreferencesAtom) }),
  (get, set, update: Partial<Preferences>) => set(storedPreferencesAtom, { ...get(storedPreferencesAtom), ...update }),
);
