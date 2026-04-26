let dataStore = {
  title: "Заголовок",
  selected: [],
  alerted: [],
  total: 67,
}
const DISABLED_HOUSES = ["_19", "_7", "_25", "_18", "_7_2"];

const STORAGE_KEY = "houseStore";

const SELECTED_SVG_CLASS = "selected-green";
const ALERTED_SVG_CLASS = "selected-red";
const DISABLED_SVG_CLASS = "disabled";
const PARAM_SHOWCONTROLS = "showcontrols";
let urlParams = new URLSearchParams(window.location.search);

window.addEventListener("load", init);

function updateViews() {
  const svgObject = document.getElementById('map_houses').contentDocument;
  const houseNumbers = svgObject.getElementsByTagName('text');
  for (let houseNumber of houseNumbers) {
    houseNumber.classList.remove(SELECTED_SVG_CLASS);
    houseNumber.classList.remove(ALERTED_SVG_CLASS);
    if (dataStore.alerted.includes(houseNumber.id))
      houseNumber.classList.add(ALERTED_SVG_CLASS)
    else if (dataStore.selected.includes(houseNumber.id))
      houseNumber.classList.add(SELECTED_SVG_CLASS)
  }
  let greenCountEl = document.getElementById("green_count");
  greenCountEl.textContent = dataStore.selected.length;
  let totalCountEl = document.getElementById("total_count");
  totalCountEl.textContent = dataStore.total;
  let percent = dataStore.selected.length / dataStore.total;
  let percentEl = document.getElementById("green_precents");
  let precentDec = (percent * 100).toFixed(1);
  percentEl.textContent = precentDec;
  let mapStatEl = document.getElementById("map_stat");
  mapStatEl.style.background = `linear-gradient(90deg, lightgreen ${precentDec}%, white 0)`;

  let headerEl = document.getElementById("map_header");
  headerEl.textContent = dataStore.title;

  selectedTxtEl = document.getElementById("txt_selected_houses");

  let houses = dataStore.selected.join("\n").replaceAll(/^_/gm, "").replaceAll("_", "/")
  selectedTxtEl.value = houses;


}

function toggle(collection, item) {
  let idx = collection.indexOf(item);
  if (idx !== -1) {
    collection.splice(idx, 1);
  } else {
    collection.push(item);
  }
}

function remove(collection, item) {
  let idx = collection.indexOf(item);
  if (idx !== -1)
    collection.splice(idx, 1);
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataStore));
}

function restoreStore() {
  let savedData = localStorage.getItem(STORAGE_KEY);
  if (savedData && savedData.length > 0) {
    let savedObject = JSON.parse(savedData);
    if (savedObject)
      Object.assign(dataStore, savedObject);
  }
  updateViews();
}


function init() {
  const svgObject = document.getElementById('map_houses').contentDocument;
  const houseNumbers = svgObject.getElementsByTagName('text');
  for (let houseNumber of houseNumbers) {
    houseNumber.addEventListener("click",
      (e) => {
        let targetId = e.target.id;
        if (e.target.classList.contains(DISABLED_SVG_CLASS))
          return;
        if (e.ctrlKey) {
          toggle(dataStore.alerted, targetId);
          remove(dataStore.selected, targetId);
        } else {
          toggle(dataStore.selected, targetId);
          remove(dataStore.alerted, targetId);
        }
        saveStore();
        updateViews();
      });
  }
  restoreStore();
  for (let disabledNumber of DISABLED_HOUSES) {
    svgObject.getElementById(disabledNumber).classList.add("disabled");
  }
  let buttonClear = document.getElementById("btn_clear");
  buttonClear.addEventListener("click", (e) => {
    dataStore.selected = [];
    dataStore.alerted = [];
    updateViews();
  });
  let controlsEl = document.getElementById("map_controls");
  if (urlParams.has(PARAM_SHOWCONTROLS))
    controlsEl.classList.remove("hidden");

  let btnApply = document.getElementById("btn_apply_numbers");
  btnApply.addEventListener("click", onApplyClick);
}

function onApplyClick() {
  let txtArea = document.getElementById("txt_selected_houses");
  let txt = txtArea.value.split(/[\n,;]/g).filter((value) => {
    return value && value.length > 0 && isValidNumber(value)
  }).map((value) => {
    return houseNumberToId(value)
  });
  console.log(txt);
  dataStore.selected = txt;
  updateViews();
}

function houseNumberToId(houseNumber) {
  return houseNumber.startsWith("_") ? houseNumber : "_" + houseNumber.replace("/", "_");
}

function houseIdToNumber(houseId) {
  return houseId.startsWith("_") ? houseId : houseId.slice(1).replace("_", "/");
}

function isValidNumber(houseNumber) {

  // return /^_([1-6]?\d|[1-9]_2)$/.test(houseId);
  let patternMatch = /^([1-6]?\d|[1-9]\/2)$/.test(houseNumber);
  if (!patternMatch)
    return false;
  let houseId = houseNumberToId(houseNumber);
  if (DISABLED_HOUSES.includes(houseId))
    return false;
  let is2line = houseNumber.endsWith("/2");
  if (is2line)
    houseNumber = houseNumber.slice(0, -2);
  let intValue = parseInt(houseNumber);
  if (isNaN(intValue))
    return false;
  return is2line ? (houseNumber > 0 && houseNumber <= 10) : (houseNumber > 0 && houseNumber <= 63);
}
