/**
 * Bloom-owned client instrumentation written into every preview workspace.
 * It stays dormant until the Bloom editor (the parent frame) turns select mode
 * on, then highlights hovered elements and posts the clicked element's
 * component chain and markup back to the editor. Snapshots drop it by marker,
 * so it never reaches revisions, the agent, or exports.
 */
export const PREVIEW_INSPECTOR_PATH = "instrumentation-client.js";
export const PREVIEW_INSPECTOR_MARKER = "// bloom:preview-inspector";

const source = String.raw`
(function () {
  if (typeof window === "undefined" || window.parent === window) return;

  var INTERNAL = /^(?:InnerLayoutRouter|OuterLayoutRouter|RenderFromTemplateContext|LoadingBoundary|ErrorBoundaryHandler|GlobalError|ClientPageRoot|ClientSegmentRoot|HotReload|ServerRoot|Root|Head|MetadataOutlet|SegmentViewNode|SegmentStateProvider|SegmentTrieNode|Suspense|Fragment|StrictMode|Link|LinkComponent|Image|ImageElement|Script)$|Provider$|Context$|Boundary$|Router$|ScrollAnd.*FocusHandler|^__|^Dev|Overlay/;
  var PROPS = ["position", "display", "flexDirection", "alignItems", "justifyContent", "width", "height", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft", "gap", "fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing", "color", "fontStyle", "textAlign", "opacity", "borderRadius", "backgroundColor", "boxShadow"];
  var COLOR_VALUE = /^(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\(|var\()/i;
  var COLOR_TOKEN = /^--(background|foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|card|card-foreground|border|surface-\d+(?:-foreground|-muted)?)$/;
  var FONT_TOKENS = ["display", "heading", "sans", "serif", "mono"];
  var active = false;
  var persist = false;
  var hovered = null;
  var selected = null;
  var trail = [];
  var original = null;
  var editing = false;
  var root = null;
  var hoverBox = null;
  var hoverLabel = null;
  var selectBox = null;
  var selectLabel = null;
  var style = null;
  var tokens = null;

  function post(message) {
    message.source = "bloom-preview";
    window.parent.postMessage(message, "*");
  }

  function fiberOf(element) {
    for (var key in element) {
      if (key.indexOf("__reactFiber$") === 0) return element[key];
    }
    return null;
  }

  function nameOf(type) {
    if (!type || (typeof type !== "function" && typeof type !== "object")) return null;
    return type.displayName || type.name ||
      (type.render && (type.render.displayName || type.render.name)) ||
      (type.type && (type.type.displayName || type.type.name)) || null;
  }

  function keep(names, name) {
    if (!name || !/^[A-Z][a-z]/.test(name) || INTERNAL.test(name)) return;
    if (names.indexOf(name) === -1) names.push(name);
  }

  function componentsOf(element) {
    var names = [];
    var fiber = fiberOf(element);
    while (fiber && names.length < 8) {
      keep(names, nameOf(fiber.type));
      if (Array.isArray(fiber._debugInfo)) {
        for (var i = 0; i < fiber._debugInfo.length; i++) {
          var info = fiber._debugInfo[i];
          if (info && typeof info.name === "string") keep(names, info.name);
        }
      }
      fiber = fiber.return;
    }
    return names.slice(0, 8);
  }

  function selectorOf(element) {
    var parts = [];
    var node = element;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 8) {
      var tag = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(tag + "#" + node.id);
        break;
      }
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ":nth-of-type(" + index + ")");
      node = node.parentElement;
    }
    if (node === document.body) parts.unshift("body");
    return parts.join(" > ").slice(0, 400);
  }

  function htmlOf(element) {
    var html = element.outerHTML;
    if (html.length <= 1600) return html;
    var open = html.slice(0, Math.min(html.indexOf(">") + 1, 1200));
    return open + "…(" + element.childElementCount + " child elements)…</" + element.tagName.toLowerCase() + ">";
  }

  function textOf(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function describe(element) {
    return {
      route: location.pathname,
      tag: element.tagName.toLowerCase(),
      components: componentsOf(element),
      selector: selectorOf(element),
      classes: (element.getAttribute("class") || "").slice(0, 600),
      text: textOf(element).slice(0, 400),
      html: htmlOf(element),
    };
  }

  function collectTokens() {
    var names = {};
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.style) {
          for (var j = 0; j < rule.style.length; j++) {
            var property = rule.style[j];
            if (property.indexOf("--color-") === 0) names[property.slice(8)] = true;
            else if (property.indexOf("--") === 0 && (COLOR_TOKEN.test(property) || COLOR_VALUE.test(rule.style.getPropertyValue(property).trim()))) names[property.slice(2)] = true;
          }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    }
    for (var i = 0; i < document.styleSheets.length; i++) {
      try { walk(document.styleSheets[i].cssRules); } catch (error) {}
    }
    var holder = document.createElement("div");
    holder.style.cssText = "display:none;color:rgb(1, 2, 3)";
    var probe = document.createElement("span");
    holder.appendChild(probe);
    document.body.appendChild(holder);
    var colors = Object.keys(names).sort().flatMap(function (name) {
      probe.style.color = "var(--color-" + name + ", var(--" + name + "))";
      var value = getComputedStyle(probe).color;
      return value === "rgb(1, 2, 3)" || !value || /^tw-|chart-|sidebar/.test(name) ? [] : [{ name: name, value: value }];
    });
    holder.remove();
    var rootStyle = getComputedStyle(document.documentElement);
    var fonts = FONT_TOKENS.flatMap(function (name) {
      var value = rootStyle.getPropertyValue("--font-" + name).trim();
      return value ? [{ name: name, value: value }] : [];
    });
    return { colors: colors, fonts: fonts };
  }

  function textEditable(element) {
    return element.childNodes.length === 1 && element.firstChild.nodeType === 3 && element.firstChild.nodeValue.trim().length > 0;
  }

  function designOf(element) {
    if (!tokens) tokens = collectTokens();
    var computed = getComputedStyle(element);
    var styles = {};
    PROPS.forEach(function (prop) { styles[prop] = computed[prop]; });
    var rect = element.getBoundingClientRect();
    styles.width = rect.width + "px";
    styles.height = rect.height + "px";
    var ancestors = [];
    var node = element.parentElement;
    while (node && node !== document.body && node !== document.documentElement && ancestors.length < 8) {
      ancestors.push({ tag: node.tagName.toLowerCase(), component: componentsOf(node)[0] || null });
      node = node.parentElement;
    }
    return { styles: styles, textEditable: textEditable(element), ancestors: ancestors, tokens: tokens };
  }

  function makeBox(color, fill, dashed) {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;display:none;box-sizing:border-box;border:" + (dashed ? "1px dashed " : "2px solid ") + color + ";background:" + fill + ";border-radius:2px;";
    var label = document.createElement("div");
    label.style.cssText = "position:fixed;display:none;padding:1px 6px;border-radius:4px;background:" + color + ";color:#fff;font:500 11px/16px ui-sans-serif,system-ui,sans-serif;white-space:nowrap;";
    root.appendChild(box);
    root.appendChild(label);
    return [box, label];
  }

  function ensureOverlay() {
    if (root) return;
    root = document.createElement("div");
    root.setAttribute("data-bloom-inspector", "");
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    var hover = makeBox("#7c3aed", "rgba(124,58,237,0.08)", false);
    hoverBox = hover[0];
    hoverLabel = hover[1];
    var select = makeBox("#2563eb", "transparent", false);
    selectBox = select[0];
    selectLabel = select[1];
    style = document.createElement("style");
    style.textContent = "*{cursor:crosshair!important}[data-bloom-editing],[data-bloom-editing] *{cursor:text!important}";
  }

  function place(box, label, element, text) {
    if (!element || !element.isConnected) {
      box.style.display = "none";
      label.style.display = "none";
      return;
    }
    var rect = element.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
    label.textContent = text;
    label.style.display = "block";
    label.style.left = Math.max(4, rect.left) + "px";
    label.style.top = (rect.top > 22 ? rect.top - 20 : Math.min(window.innerHeight - 20, rect.bottom + 4)) + "px";
  }

  function nameTag(element) {
    var names = componentsOf(element);
    return (names[0] ? names[0] + " · " : "") + element.tagName.toLowerCase();
  }

  function paint() {
    if (!root) return;
    var showHover = active && hovered && hovered !== selected && !editing;
    if (showHover) {
      var rect = hovered.getBoundingClientRect();
      place(hoverBox, hoverLabel, hovered, nameTag(hovered) + "  " + Math.round(rect.width) + "×" + Math.round(rect.height));
    } else {
      place(hoverBox, hoverLabel, null, "");
    }
    if (selected) {
      var size = selected.getBoundingClientRect();
      place(selectBox, selectLabel, selected, selected.tagName.toLowerCase() + "  " + Math.round(size.width) + "×" + Math.round(size.height));
    } else {
      place(selectBox, selectLabel, null, "");
    }
  }

  function target(event) {
    var element = event.target;
    if (!element || element.nodeType !== 1 || element === document.documentElement || element === document.body) return null;
    if (root && root.contains(element)) return null;
    return element;
  }

  function insideEditing(event) {
    return editing && selected && event.target && selected.contains(event.target);
  }

  function onMove(event) {
    if (editing) return;
    var element = target(event);
    if (!element || element === hovered) return;
    if (trail.length > 0 && hovered && hovered.contains(element)) return;
    hovered = element;
    trail = [];
    paint();
  }

  function block(event) {
    if (insideEditing(event) || !target(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function restore() {
    if (!selected || !original) return;
    if (original.style === null) selected.removeAttribute("style");
    else selected.setAttribute("style", original.style);
    if (original.text !== null && selected.firstChild) selected.firstChild.nodeValue = original.text;
  }

  function select(element) {
    if (element === selected) return;
    stopEditing(false);
    restore();
    selected = element;
    original = element ? {
      style: element.getAttribute("style"),
      text: textEditable(element) ? element.firstChild.nodeValue : null,
    } : null;
    paint();
    if (element) {
      post({ type: "select", selection: describe(element), design: designOf(element), additive: false });
    } else {
      post({ type: "deselect" });
    }
  }

  function startEditing() {
    if (!selected || !textEditable(selected)) return;
    editing = true;
    selected.setAttribute("data-bloom-editing", "");
    selected.setAttribute("contenteditable", "plaintext-only");
    selected.focus();
    var range = document.createRange();
    range.selectNodeContents(selected);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    paint();
  }

  function stopEditing(revert) {
    if (!editing || !selected) return;
    editing = false;
    selected.removeAttribute("contenteditable");
    selected.removeAttribute("data-bloom-editing");
    if (selected.childNodes.length !== 1 || selected.firstChild.nodeType !== 3) {
      selected.textContent = selected.textContent;
    }
    if (revert && original && original.text !== null) {
      selected.firstChild.nodeValue = original.text;
    }
    post({ type: "text", value: selected.textContent });
    paint();
  }

  function onClick(event) {
    if (insideEditing(event)) return;
    var element = target(event);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (editing) stopEditing(false);
    var picked = hovered && hovered.contains(element) ? hovered : element;
    if (!persist) {
      post({ type: "select", selection: describe(picked), additive: event.shiftKey });
      if (!event.shiftKey) setActive(false, false, true);
      return;
    }
    if (event.shiftKey) {
      post({ type: "select", selection: describe(picked), additive: true });
      return;
    }
    if (event.detail >= 2 && picked === selected) {
      startEditing();
      return;
    }
    select(picked);
  }

  function onDoubleClick(event) {
    if (insideEditing(event)) return;
    var element = target(event);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!persist) return;
    if (element !== selected && !(selected && selected.contains(element))) select(element);
    startEditing();
  }

  function onKey(event) {
    if (editing) {
      if (event.key === "Escape") {
        event.preventDefault();
        stopEditing(true);
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        stopEditing(false);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (persist && selected) select(null);
      else setActive(false, false, true);
    } else if (event.key === "ArrowUp" && hovered && hovered.parentElement && hovered.parentElement !== document.body) {
      event.preventDefault();
      trail.push(hovered);
      hovered = hovered.parentElement;
      paint();
    } else if (event.key === "ArrowDown" && trail.length > 0) {
      event.preventDefault();
      hovered = trail.pop();
      paint();
    } else if (event.key === "Enter" && persist && selected) {
      event.preventDefault();
      startEditing();
    }
  }

  var LISTENERS = [
    ["pointermove", onMove, true],
    ["pointerdown", block, true],
    ["mousedown", block, true],
    ["pointerup", block, true],
    ["mouseup", block, true],
    ["click", onClick, true],
    ["dblclick", onDoubleClick, true],
    ["keydown", onKey, true],
    ["scroll", paint, true],
    ["resize", paint, false],
  ];

  function setActive(next, nextPersist, notify) {
    persist = Boolean(next && nextPersist);
    if (next === active) return;
    active = next;
    LISTENERS.forEach(function (entry) {
      window[active ? "addEventListener" : "removeEventListener"](entry[0], entry[1], entry[2]);
    });
    if (active) {
      ensureOverlay();
      window.focus();
      document.documentElement.appendChild(root);
      document.head.appendChild(style);
    } else {
      stopEditing(false);
      restore();
      selected = null;
      original = null;
      hovered = null;
      trail = [];
      if (root) root.remove();
      if (style) style.remove();
    }
    paint();
    if (notify) post({ type: "state", active: active });
  }

  function applyStyles(css) {
    if (!selected || !original) return;
    if (original.style === null) selected.removeAttribute("style");
    else selected.setAttribute("style", original.style);
    for (var prop in css) {
      if (css[prop]) selected.style[prop] = css[prop];
    }
    requestAnimationFrame(paint);
  }

  function commit() {
    var element = selected;
    if (!element) return;
    var done = false;
    function finish() {
      if (done || element !== selected) return;
      done = true;
      observer.disconnect();
      if (original.style === null) element.removeAttribute("style");
      else element.setAttribute("style", original.style);
      original = {
        style: element.getAttribute("style"),
        text: textEditable(element) ? element.firstChild.nodeValue : null,
      };
      tokens = null;
      paint();
      post({ type: "select", selection: describe(element), design: designOf(element), additive: false, refresh: true });
    }
    var observer = new MutationObserver(finish);
    observer.observe(element, { attributes: true, attributeFilter: ["class"] });
    setTimeout(finish, 5000);
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.source !== "bloom") return;
    if (data.type === "inspect") {
      if (active && !data.active) setActive(false, false, false);
      else if (!active && data.active) setActive(true, data.persist, false);
      else {
        persist = Boolean(data.active && data.persist);
        if (!persist && selected) select(null);
      }
    } else if (data.type === "style") {
      applyStyles(data.css || {});
    } else if (data.type === "text" && selected && original && original.text !== null && selected.firstChild) {
      selected.firstChild.nodeValue = data.value;
      paint();
    } else if (data.type === "reset") {
      stopEditing(false);
      restore();
      paint();
      if (selected) post({ type: "text", value: selected.textContent });
    } else if (data.type === "commit") {
      commit();
    } else if (data.type === "deselect") {
      select(null);
    } else if (data.type === "select-ancestor" && selected) {
      var node = selected;
      for (var i = 0; i < data.depth && node.parentElement && node.parentElement !== document.body; i++) node = node.parentElement;
      select(node);
    } else if (data.type === "select-selector" && active && persist) {
      var found = null;
      try { found = document.querySelector(data.selector); } catch (error) {}
      if (found) select(found);
    } else if (data.type === "edit-text" && selected) {
      startEditing();
    }
  });

  post({ type: "ready" });
})();
`;

export const PREVIEW_INSPECTOR_CONTENT = `${PREVIEW_INSPECTOR_MARKER}\n/* eslint-disable */\n${source.trim()}\n`;
