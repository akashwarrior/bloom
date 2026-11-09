import { atom } from "jotai";

export const WORKBENCH_VIEWS = ["preview", "files", "design"] as const;
export type WorkbenchView = (typeof WORKBENCH_VIEWS)[number];

export const workbenchViewAtom = atom<WorkbenchView>("preview");
export const previewPathAtom = atom("/");
export const previewReloadAtom = atom(0);

export const reloadPreviewAtom = atom(null, (_get, set) => {
  set(previewReloadAtom, (key) => key + 1);
});

export const openPreviewPathAtom = atom(null, (get, set, path: string) => {
  set(previewPathAtom, path);
  set(reloadPreviewAtom);
  if (get(workbenchViewAtom) === "files") set(workbenchViewAtom, "preview");
});

export function previewPageUrl(previewUrl: string | null, path: string) {
  if (!previewUrl) return null;
  return new URL(`/${path.replaceAll("\\", "/").replace(/^\/+/, "")}`, previewUrl).toString();
}
