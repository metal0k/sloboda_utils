// Theme management: applies CSS data-theme attribute and wires the toolbar button.

import { getSettings, setTheme, subscribeSettings } from "../settings";
import type { ThemeChoice } from "../settings";

function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "auto") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return choice;
}

function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset["theme"] = resolveTheme(choice);
}

/** Apply theme before the DOM shell is built, preventing a flash. */
export function applyInitialTheme(): void {
  applyTheme(getSettings().theme);
}

/** Wire the theme toggle button and subscribe to reactive updates. */
export function initTheme(btn: HTMLButtonElement): void {
  function updateBtn(choice: ThemeChoice): void {
    const resolved = resolveTheme(choice);
    if (resolved === "dark") {
      // Currently dark — next click goes light; show sun to signal that.
      btn.textContent = "☀";
      btn.setAttribute("aria-label", "Включить светлую тему");
    } else {
      // Currently light — next click goes dark; show moon to signal that.
      btn.textContent = "🌙";
      btn.setAttribute("aria-label", "Включить тёмную тему");
    }
  }

  // Track the media-query listener so we can remove it when leaving "auto".
  let mql: MediaQueryList | null = null;
  let mqlListener: ((e: MediaQueryListEvent) => void) | null = null;

  function attachMql(): void {
    mql = window.matchMedia("(prefers-color-scheme: light)");
    mqlListener = () => {
      if (getSettings().theme === "auto") {
        applyTheme("auto");
        updateBtn("auto");
      }
    };
    mql.addEventListener("change", mqlListener);
  }

  function detachMql(): void {
    if (mql && mqlListener) {
      mql.removeEventListener("change", mqlListener);
      mql = null;
      mqlListener = null;
    }
  }

  // Button click: toggle between light and dark (flattens "auto" on first click).
  btn.addEventListener("click", () => {
    const resolved = resolveTheme(getSettings().theme);
    setTheme(resolved === "light" ? "dark" : "light");
  });

  // Reactive subscription: apply theme and update button on any settings change.
  subscribeSettings((s) => {
    applyTheme(s.theme);
    updateBtn(s.theme);

    if (s.theme === "auto") {
      if (!mql) attachMql();
    } else {
      detachMql();
    }
  });

  // Attach system listener if starting in "auto".
  if (getSettings().theme === "auto") {
    attachMql();
  }

  // Initialise button label immediately.
  updateBtn(getSettings().theme);
}
