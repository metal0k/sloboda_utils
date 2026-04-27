// Import-from-URL banner shown when the page loads with a #s= hash.
// Styled as a plain MD3 elevated card — column layout with radio UI.

import { type SharedSnapshot, listProjects, importSnapshot, getState } from "../state";
import { showToast } from "./sheet";

export function showImportBanner(incoming: SharedSnapshot): void {
  document.querySelector(".import-banner")?.remove();

  const ageMs = Date.now() - incoming.updatedAt;
  let ageStr: string;
  if (ageMs < 60_000) ageStr = "только что";
  else if (ageMs < 3_600_000) ageStr = `${Math.round(ageMs / 60_000)} мин назад`;
  else ageStr = `${Math.round(ageMs / 3_600_000)} ч назад`;

  const projects = listProjects();
  const matchedProject = projects.find(
    (p) => p.name.trim().toLowerCase() === incoming.name.trim().toLowerCase(),
  );

  const banner = document.createElement("div");
  banner.className = "import-banner";

  // Header
  const header = document.createElement("div");
  header.className = "import-banner__header";
  const titleStrong = document.createElement("strong");
  titleStrong.className = "import-banner__title";
  titleStrong.textContent = `«${incoming.name}»`;
  const ageSpan = document.createElement("span");
  ageSpan.className = "import-banner__age";
  ageSpan.textContent = ageStr;
  header.append(titleStrong, document.createTextNode(" "), ageSpan);

  // Radio group
  const radioGroup = document.createElement("div");
  radioGroup.className = "import-banner__radios";

  const uid = Math.random().toString(36).slice(2);
  const { radio: radioCreate, row: createRow } = makeRadioRow(`ic-${uid}`, "import-mode", "create", "Создать новый");
  const { radio: radioOverwrite, row: overwriteRow } = makeRadioRow(`io-${uid}`, "import-mode", "overwrite", "Перезаписать");

  // Select for overwrite target
  const select = document.createElement("select");
  select.className = "import-banner__select";
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  overwriteRow.appendChild(select);

  // Default selection
  if (matchedProject) {
    radioOverwrite.checked = true;
    select.value = matchedProject.id;
  } else {
    radioCreate.checked = true;
    select.disabled = true;
  }

  radioCreate.addEventListener("change", () => { select.disabled = true; });
  radioOverwrite.addEventListener("change", () => { select.disabled = false; });

  radioGroup.append(createRow, overwriteRow);

  // Actions
  const actions = document.createElement("div");
  actions.className = "import-banner__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "import-banner__cancel";
  cancelBtn.textContent = "Отмена";

  const applyBtn = document.createElement("button");
  applyBtn.className = "import-banner__accept";
  applyBtn.textContent = "Применить";

  const dismiss = () => {
    banner.remove();
    history.replaceState(null, "", location.pathname + location.search);
  };

  cancelBtn.addEventListener("click", dismiss);

  applyBtn.addEventListener("click", () => {
    if (radioOverwrite.checked) {
      importSnapshot(incoming, { mode: "overwrite", targetId: select.value });
      showToast("Данные обновлены");
    } else {
      if (getState().projects.length >= 20) {
        showToast("Лимит 20 проектов");
        return;
      }
      importSnapshot(incoming, { mode: "create" });
      showToast("Проект создан");
    }
    dismiss();
  });

  actions.append(cancelBtn, applyBtn);
  banner.append(header, radioGroup, actions);
  document.body.appendChild(banner);
}

function makeRadioRow(
  id: string,
  name: string,
  value: string,
  labelText: string,
): { radio: HTMLInputElement; row: HTMLElement } {
  const row = document.createElement("div");
  row.className = "import-banner__radio-row";

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.id = id;
  radio.name = name;
  radio.value = value;
  radio.className = "import-banner__radio";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  row.append(radio, label);
  return { radio, row };
}
