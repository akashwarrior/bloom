const TAG = "a|article|aside|button|dialog|div|fieldset|footer|form|h[1-6]|header|img|input|label|li|main|nav|ol|option|p|section|select|span|summary|table|tbody|td|textarea|th|tr|ul";
/** One compound selector without its attribute tests and pseudo arguments: `label`, `.plan`, `#email`, `input:checked`, or a combinator. */
const COMPOUND = new RegExp(`^(?:[>+~,*]|(?:${TAG})(?:[#.][\\w-]+|::?[\\w-]+)*|(?:[#.][\\w-]+|::?[\\w-]+)+)$`);

/**
 * The selector to hand to the browser. A control is often named by what it
 * says ("Open account", "9:30 AM", "You are on the list") instead of by a CSS
 * selector; that is matched as visible text rather than failing as an invalid
 * selector or an unknown tag.
 */
export function pageSelector(value: string) {
  const selector = value.trim();
  // Attribute tests and pseudo arguments may hold any text; what is left decides.
  let bare = selector.replace(/\[[^\]]*\]/g, " ");
  for (let previous = ""; previous !== bare;) {
    previous = bare;
    bare = bare.replace(/\([^()]*\)/g, " ");
  }
  const parts = bare.split(/\s+/).filter(Boolean);
  const css = parts.length > 0 ? parts.every((part) => COMPOUND.test(part)) : selector.startsWith("[");
  return css ? selector : `::-p-text(${selector.replace(/[\\()]/g, "\\$&")})`;
}
