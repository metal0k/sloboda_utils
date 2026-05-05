import { subscribe } from "../state";

const KEY = "sloboda/firstRun/v1";

export function initFirstRun(): void {
  if (localStorage.getItem(KEY)) return;

  const tip = document.createElement("div");
  tip.className = "first-run-tip";
  tip.setAttribute("role", "status");
  tip.setAttribute("aria-live", "polite");
  tip.innerHTML =
    '<span class="first-run-tip__text">Нажмите на дом, чтобы отметить «готово»</span>' +
    '<span class="first-run-tip__arrow" aria-hidden="true"></span>';
  document.body.appendChild(tip);

  let dismissed = false;

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    tip.classList.remove("first-run-tip--visible");
    tip.addEventListener("transitionend", () => tip.remove(), { once: true });
    localStorage.setItem(KEY, "1");
    unsub();
  }

  const showTimer = window.setTimeout(() => tip.classList.add("first-run-tip--visible"), 900);
  const autoTimer = window.setTimeout(dismiss, 12_000);

  const unsub = subscribe(() => {
    clearTimeout(showTimer);
    clearTimeout(autoTimer);
    dismiss();
  });

  tip.addEventListener("click", () => {
    clearTimeout(showTimer);
    clearTimeout(autoTimer);
    dismiss();
  });
}
