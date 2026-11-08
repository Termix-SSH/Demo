// More checks for scripts/ui-full-audit.ts: overflow, clipping, labels, native
// selects and rounded containers. Plain JS so tsx adds no helpers.
(() => {
  const problems = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.tagName)
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 30);

  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1)
    problems.push(
      `page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`,
    );

  const stage = document.querySelector('[data-slot="tab-stage"]');
  const roots = stage ? Array.from(stage.children).filter(visible) : [];
  const root = roots[0] ?? document.body;
  const box = root.getBoundingClientRect();
  const all = (selector) =>
    Array.from(root.querySelectorAll(selector)).filter(visible);
  const scrollsX = (el) => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };

  // Things sticking out past the right edge of the pane.
  for (const el of all(
    "button, input, select, textarea, h1, h2, h3, p, label, table",
  )) {
    const r = el.getBoundingClientRect();
    if (r.right > box.right + 1 && !scrollsX(el))
      problems.push(
        `past right edge by ${Math.round(r.right - box.right)}px: ${label(el)}`,
      );
  }

  // Text cut off with no ellipsis.
  for (const el of all("button, label, h1, h2, h3, span, p, td, th")) {
    if (el.children.length > 2) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow !== "hidden" && cs.overflowX !== "hidden") continue;
    if (cs.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 2 && (el.textContent ?? "").trim())
      problems.push(`clipped text: ${label(el)}`);
  }

  // Icon buttons nobody can name.
  for (const el of all("button, [role=button], a[href]")) {
    const text = (el.textContent ?? "").trim();
    if (text) continue;
    if (el.getAttribute("aria-label") || el.getAttribute("title")) continue;
    if (el.getAttribute("aria-labelledby")) continue;
    if (el.closest("label")) continue;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
      continue;
    if (el.closest("label")) continue;
    if (el.id && document.querySelector()) continue;
    problems.push(
      `button with no label (${
        el
          .querySelector("svg")
          ?.getAttribute("class")
          ?.match(/lucide-[\w-]+/)?.[0] ?? "no icon"
      }) ${el.outerHTML.replace(/\s+/g, " ").slice(0, 110)}`,
    );
  }

  const natives = all("select").filter(
    (el) =>
      !el.closest("[aria-hidden=true]") &&
      !el.classList.contains("sr-only") &&
      el.getBoundingClientRect().width > 2 &&
      getComputedStyle(el).opacity !== "0",
  );
  if (natives.length) problems.push(`native select x${natives.length}`);

  // Rounded boxes. Small controls may stay rounded, containers may not.
  for (const el of all("div, section, form, article, aside")) {
    const r = el.getBoundingClientRect();
    if (r.width < 220 || r.height < 90) continue;
    if (
      el.closest(
        '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper], [role="tooltip"]',
      )
    )
      continue;
    const cs = getComputedStyle(el);
    const radius = parseFloat(cs.borderTopLeftRadius);
    if (radius < 4) continue;
    const bordered =
      parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== "none";
    const filled =
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      cs.backgroundColor !== "transparent";
    if (bordered || filled)
      problems.push(
        `rounded container ${Math.round(radius)}px ${Math.round(r.width)}x${Math.round(r.height)}`,
      );
  }

  // Overlapping siblings in a row (text drawn on top of text).
  for (const el of all("button, input, [data-slot=select-trigger]")) {
    const r = el.getBoundingClientRect();
    const sib = el.nextElementSibling;
    if (!sib || !visible(sib)) continue;
    if (getComputedStyle(sib).position === "absolute") continue;
    const s = sib.getBoundingClientRect();
    const sameRow = Math.abs(s.top - r.top) < r.height / 2;
    if (sameRow && s.left < r.right - 2 && s.right > r.left + 2)
      problems.push(`overlap: ${label(el)} / ${label(sib)}`);
  }

  // Raw English left in t() keys.
  const keyLike = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+){2,}$/;
  for (const el of all("button, label, h1, h2, h3, p, span, th, td")) {
    if (el.children.length) continue;
    const text = (el.textContent ?? "").trim();
    if (keyLike.test(text) && !/^v?\d/.test(text))
      problems.push(`missing translation: ${text}`);
  }
  const dashes = (root.innerText ?? "").match(/[^\n]{0,20}[–—][^\n]{0,20}/g);
  if (dashes) problems.push(`dash in text: ${dashes[0]}`);

  return [...new Set(problems)].slice(0, 40);
})();
