// Import-from-URL banner shown when the page loads with a #s= hash.

import type { State } from "../state";

export function showImportBanner(
  incoming: State,
  onAccept: () => void,
): void {
  document.querySelector(".import-banner")?.remove();

  const ageMs = Date.now() - incoming.updatedAt;
  let ageStr: string;
  if (ageMs < 60_000) ageStr = "только что";
  else if (ageMs < 3_600_000) ageStr = `${Math.round(ageMs / 60_000)} мин назад`;
  else ageStr = `${Math.round(ageMs / 3_600_000)} ч назад`;

  const banner = document.createElement("div");
  banner.className = "import-banner";
  banner.innerHTML = `
    <span class="import-banner__msg">
      Принять состояние из ссылки?
      <small class="import-banner__age">(обновлено ${ageStr})</small>
    </span>
    <div class="import-banner__actions">
      <button class="btn btn-primary import-banner__accept">Принять</button>
      <button class="btn import-banner__cancel">Отменить</button>
    </div>
  `;

  document.body.appendChild(banner);

  const dismiss = () => {
    banner.remove();
    history.replaceState(null, "", location.pathname + location.search);
  };

  banner.querySelector(".import-banner__accept")!.addEventListener("click", () => {
    onAccept();
    dismiss();
  });
  banner.querySelector(".import-banner__cancel")!.addEventListener("click", dismiss);
}
