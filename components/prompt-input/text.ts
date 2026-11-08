function insertText(
  element: HTMLTextAreaElement,
  text: string,
  start = element.selectionStart,
  end = element.selectionEnd
) {
  element.focus()
  element.setSelectionRange(start, end)
  let inserted = false
  try {
    inserted = document.execCommand("insertText", false, text)
  } catch {
    inserted = false
  }
  if (!inserted || element.value.slice(start, start + text.length) !== text) {
    element.setRangeText(text, start, end, "end")
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function isImeEnter(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229
}

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token)
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1))
      return type === token
    })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function countLines(text: string) {
  return text.split("\n").length
}

export {
  countLines,
  formatBytes,
  insertText,
  isImeEnter,
  matchesAccept,
}
