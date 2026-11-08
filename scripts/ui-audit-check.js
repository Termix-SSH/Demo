// Runs inside the page for scripts/ui-audit.ts. Plain JS so tsx adds no helpers.
(() => {
  const problems = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return getComputedStyle(el).visibility !== "hidden";
  };
  const label = (el) =>
    (
      el.getAttribute("aria-label") ||
      el.textContent ||
      el.getAttribute("placeholder") ||
      el.tagName
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 30);

  const stage = document.querySelector('[data-slot="tab-stage"]');
  const roots = stage
    ? Array.from(stage.children).filter(visible)
    : [document.body];
  const root = roots[0];
  if (!root) return ["no visible tab"];
  const box = root.getBoundingClientRect();
  const all = (selector) =>
    Array.from(root.querySelectorAll(selector)).filter(visible);

  // Rows of controls whose heights differ. A row is controls sharing a
  // vertical center inside the same flex parent.
  const controls = all(
    'button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), select, [data-slot="select-trigger"], textarea, [data-slot="segmented"], [data-slot="view-toggle"]',
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return (
      r.height >= 20 &&
      r.height <= 40 &&
      !el.closest(
        '[role="tablist"], [data-slot="tab-strip"], table, li, [data-list-row]',
      ) &&
      !(
        el.matches("button") &&
        el.closest('[data-slot="segmented"], [data-slot="view-toggle"]')
      )
    );
  });
  const groups = new Map();
  for (const el of controls) {
    const parent = el.parentElement;
    const r = el.getBoundingClientRect();
    const key = parent;
    const list = groups.get(key) ?? [];
    list.push({ el, r });
    groups.set(key, list);
  }
  // Merge siblings one level up too, since inputs often sit in a wrapper.
  const rows = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    let row = rows.find(
      (x) => Math.abs(x.mid - mid) < 3 && Math.abs(x.top - r.top) < 12,
    );
    if (!row) {
      row = { mid, top: r.top, items: [] };
      rows.push(row);
    }
    row.items.push({ el, r });
  }
  // Split rows where controls are far apart, so a nav item never joins a
  // toolbar on the other side of the page.
  const clusters = [];
  for (const row of rows) {
    const items = row.items.slice().sort((a, b) => a.r.left - b.r.left);
    let current = [];
    for (const item of items) {
      const last = current[current.length - 1];
      if (last && item.r.left - last.r.right > 120) {
        clusters.push({ items: current });
        current = [];
      }
      current.push(item);
    }
    if (current.length) clusters.push({ items: current });
  }
  for (const row of clusters) {
    if (row.items.length < 2) continue;
    // Only rows that read as a toolbar: some input, select or segmented.
    const hasField = row.items.some(({ el }) =>
      el.matches('input, select, [data-slot="select-trigger"]'),
    );
    if (!hasField) continue;
    const heights = [
      ...new Set(row.items.map(({ r }) => Math.round(r.height))),
    ];
    if (heights.length > 1)
      problems.push(
        `toolbar heights ${heights.join("/")}: ${row.items.map(({ el }) => label(el)).join(" | ")}`,
      );
  }

  // Raw spinners outside LoadingState and refresh buttons.
  const spinners = all(".animate-spin").filter(
    (el) => !el.closest('[data-slot="loading-state"], button'),
  );
  if (spinners.length) problems.push(`raw spinner x${spinners.length}`);
  if (all('[data-slot="loading-state"]').length)
    problems.push("still loading after wait");

  // Back buttons that are not the 50px shared one.
  for (const svg of all("svg.lucide-arrow-left, svg.lucide-chevron-left")) {
    const button = svg.closest("button");
    if (!button || !visible(button)) continue;
    const r = button.getBoundingClientRect();
    // BackButton is w-12.5 in a h-12.5 header, about 44px at the 14px root.
    const size =
      parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.125;
    if (Math.abs(r.width - size) > 1.5 || Math.abs(r.height - size) > 2)
      problems.push(
        `back button ${Math.round(r.width)}x${Math.round(r.height)}${button.textContent.trim() ? " with text" : ""}`,
      );
  }

  // Text or fields flush against the left edge of the tab.
  for (const el of all("p, input, textarea, label, h2, h3, pre")) {
    const r = el.getBoundingClientRect();
    if (Math.abs(r.left - box.left) < 2 && r.width < box.width - 4)
      problems.push(`flush left: ${label(el)}`);
  }

  // Two lines stacked at the bottom of a form: an element's bottom border
  // touching the footer's top border.
  const lines = [];
  for (const el of all("*")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < box.width * 0.5) continue;
    if (
      parseFloat(cs.borderBottomWidth) >= 1 &&
      cs.borderBottomStyle !== "none"
    )
      lines.push(Math.round(r.bottom - parseFloat(cs.borderBottomWidth)));
    if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== "none")
      lines.push(Math.round(r.top));
  }
  lines.sort((a, b) => a - b);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] - lines[i - 1] === 1) {
      problems.push(`double line at y=${lines[i]}`);
      break;
    }
  }

  // Wide filter groups: segmented buttons stretched across the pane.
  for (const el of all('[role="radiogroup"], [data-slot="segmented"]')) {
    if (el.getBoundingClientRect().width > box.width * 0.6)
      problems.push(`stretched segmented: ${label(el)}`);
  }

  // Text viewers that stop well before the bottom of the tab.
  for (const el of all("pre, textarea")) {
    const r = el.getBoundingClientRect();
    if (r.height > 200 && box.bottom - r.bottom > 120)
      problems.push(
        `viewer ends ${Math.round(box.bottom - r.bottom)}px above bottom`,
      );
  }

  // More than one dot badge on a sidebar host row.
  for (const row of Array.from(document.querySelectorAll("[data-host-id]"))) {
    const dots = Array.from(row.querySelectorAll("*")).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.width <= 10 &&
        Math.abs(r.width - r.height) < 1 &&
        cs.borderRadius !== "0px"
      );
    });
    if (dots.length > 1)
      problems.push(
        `host row ${row.getAttribute("data-host-id")} has ${dots.length} dots`,
      );
  }
  // Controls squeezed against the lines of the bar they sit in.
  const lined = (el) => {
    const cs = getComputedStyle(el);
    return (
      (parseFloat(cs.borderBottomWidth) >= 1 &&
        cs.borderBottomStyle !== "none") ||
      (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== "none")
    );
  };
  for (const el of all(
    '[data-slot="segmented"], [data-slot="button"], [data-slot="input"], [data-slot="select-trigger"]',
  )) {
    const r = el.getBoundingClientRect();
    if (!r.height || r.height > 40) continue;
    let bar = el.parentElement;
    while (bar && bar !== root && !lined(bar)) bar = bar.parentElement;
    if (!bar || bar === root) continue;
    const b = bar.getBoundingClientRect();
    if (b.height > r.height + 24) continue;
    const top = r.top - b.top;
    const bottom = b.bottom - r.bottom;
    if (top < 2.5 || bottom < 2.5)
      problems.push(
        `tight in bar (${top.toFixed(1)}/${bottom.toFixed(1)}): ${label(el)}`,
      );
  }
  return [...new Set(problems)];
})();
