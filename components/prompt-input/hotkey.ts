const modifierOrder = ["ctrl", "alt", "shift", "mod", "meta"]

const aliases: Record<string, string> = {
  cmd: "meta",
  command: "meta",
  control: "ctrl",
  option: "alt",
  opt: "alt",
  return: "enter",
  esc: "escape",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  " ": "space",
}

function normalizeKey(token: string) {
  const key = token.trim().toLowerCase()
  return aliases[key] ?? key
}

function isApplePlatform() {
  if (typeof navigator === "undefined") {
    return true
  }
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

function parseChord(hotkey: string) {
  const chord = hotkey.trim().split(/\s+/)[0] ?? ""
  const parts = chord
    .split(/\+(?!$)/)
    .map(normalizeKey)
    .filter(Boolean)
  const key = parts.at(-1) ?? ""
  const modifiers = parts
    .slice(0, -1)
    .sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b))
  return [...modifiers, key]
}

function eventKeys(event: KeyboardEvent) {
  const keys = new Set([normalizeKey(event.key === " " ? "space" : event.key)])
  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code ?? "")
  if (physical) {
    keys.add((physical[1] ?? physical[2]).toLowerCase())
  }
  return keys
}

function matchesHotkey(event: KeyboardEvent, hotkey: string) {
  const parts = parseChord(hotkey)
  const key = parts.pop()
  const wants = new Set(parts)
  const apple = isApplePlatform()
  const meta = wants.has("meta") || (wants.has("mod") && apple)
  const ctrl = wants.has("ctrl") || (wants.has("mod") && !apple)

  return (
    key !== undefined &&
    eventKeys(event).has(key) &&
    event.metaKey === meta &&
    event.ctrlKey === ctrl &&
    event.altKey === wants.has("alt") &&
    event.shiftKey === wants.has("shift")
  )
}

export { matchesHotkey }
