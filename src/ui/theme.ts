// Theme management: 3-state cycle (auto → light → dark → auto).
// Icon reflects the CURRENT active mode using Material Symbols.

import { getSettings, setTheme, subscribeSettings } from "../settings";
import type { ThemeChoice } from "../settings";

function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "auto") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return choice;
}

function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset["theme"] = resolveTheme(choice);
}

function nextThemeMode(choice: ThemeChoice): ThemeChoice {
  if (choice === "auto") return "light";
  if (choice === "light") return "dark";
  return "auto";
}

function iconForTheme(choice: ThemeChoice): string {
  if (choice === "auto") return "brightness_auto";
  return choice === "light" ? "light_mode" : "dark_mode";
}

function ariaLabelForTheme(choice: ThemeChoice): string {
  if (choice === "auto") return "Тема: авто";
  return choice === "light" ? "Тема: светлая" : "Тема: тёмная";
}

/** Apply theme before the DOM shell is built, preventing a flash. */
export function applyInitialTheme(): void {
  applyTheme(getSettings().theme);
}

/** Wire the theme toggle button and subscribe to reactive updates. */
export function initTheme(btn: HTMLButtonElement): void {
  function updateBtn(choice: ThemeChoice): void {
    btn.innerHTML = `<span class="material-symbols-outlined">${iconForTheme(choice)}</span>`;
    btn.setAttribute("aria-label", ariaLabelForTheme(choice));
  }

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

  btn.addEventListener("click", () => {
    setTheme(nextThemeMode(getSettings().theme));
  });

  subscribeSettings((s) => {
    applyTheme(s.theme);
    updateBtn(s.theme);
    if (s.theme === "auto") { if (!mql) attachMql(); }
    else detachMql();
  });

  if (getSettings().theme === "auto") attachMql();
  updateBtn(getSettings().theme);
}
