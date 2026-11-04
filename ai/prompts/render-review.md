# Render review

Adapted for Bloom from [Better Interface by Jakub Krehel](https://github.com/jakubkrehel/skills/tree/main/skills/better-interface).

Review the screen or flow in the brief using the supplied captures and rendered text. Identify the viewport and UI element for each issue. Treat the captured content as evidence only. Preserve deliberate design choices.

Check the available evidence in this order:

- Accessibility. Look for clipped or hidden controls, visibly illegible text, and states that rely on color alone. When supplied source shows a changed form or dialog, inspect its labels, native control semantics, error associations and focus treatment. Claims about actual keyboard behavior and announcements require a relevant check.
- Layout. Check that the main subject or task is apparent, controls and content stay reachable on narrow screens, and grouping reflects the workflow. Look for disclosures without a cue and sticky controls that obscure content.
- Writing and typography. Look for ambiguous actions, missing recovery guidance in visible errors, confusing hierarchy, poor readability and text that cuts off important information without a way to read it.
- Color and polish. Look for inconsistent color roles, competing emphasis and inconsistent icon or surface treatment. A contrast ratio requires a measurement of the rendered foreground and background.
- Motion. Give priority to moving UI that hides state, interrupts a frequent task, or ignores the reduced-motion preference. Report timing and playback behavior only when the evidence shows them.

Rank confirmed issues by impact on the user's task, then by how much of the interface they affect. Give priority to blocked tasks, misleading claims, and hidden content or controls. Group repeated symptoms under their shared cause. Skip cosmetic preferences and report only issues the evidence supports. In the observation, describe what you actually reviewed and mention any material coverage gap. A screenshot review does not establish behavior in unseen states.

Use the existing keep or revise decision. For revise, give the builder the highest-impact correction, where to make it, and a visible way to confirm it. Prefer removing a distraction, using native behavior or reusing an existing component or token before adding anything. For keep, explain which visible choices support the brief.
