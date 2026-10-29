const landingDraftKey = "bloom:landing-draft";

export function projectDraftKey(projectId: string) {
  return `prompt-draft:${projectId}`;
}

export function saveLandingDraft(prompt: string) {
  try {
    if (prompt) sessionStorage.setItem(landingDraftKey, prompt);
    else sessionStorage.removeItem(landingDraftKey);
  } catch {}
}

export function transferLandingDraft(projectId: string) {
  try {
    const draft = sessionStorage.getItem(landingDraftKey);
    if (!draft) return;
    localStorage.setItem(projectDraftKey(projectId), draft);
    sessionStorage.removeItem(landingDraftKey);
  } catch {}
}
