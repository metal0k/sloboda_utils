// FAB «Поделиться» — fixed bottom-right, opens the share dialog.

export function initFab(onClick: () => void): void {
  const wrap = document.createElement("div");
  wrap.className = "sheet-fab";

  const fab = document.createElement("md-fab");
  fab.setAttribute("variant", "primary");
  fab.setAttribute("aria-label", "Поделиться");
  fab.innerHTML = `<md-icon slot="icon">share</md-icon>`;
  fab.addEventListener("click", onClick);

  wrap.appendChild(fab);
  document.body.appendChild(wrap);
}
