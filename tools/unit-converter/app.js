const categoryList = document.getElementById("category-list");
const precisionDropdown = document.getElementById("precision-dropdown");
const valueInput = document.getElementById("value-input");
const fromUnitList = document.getElementById("from-unit-list");
const toUnitList = document.getElementById("to-unit-list");
const swapButton = document.getElementById("swap-units");
const copyButton = document.getElementById("copy-result");
const resultNode = document.getElementById("result");
const resultMetaNode = document.getElementById("result-meta");
const allResultsNode = document.getElementById("all-results");
const errorNode = document.getElementById("error");

// The category is view state, so it lives in the hash — but through the shared
// helper: assigning location.hash pushed a history entry per chip click, which
// inside the dashboard iframe hijacked the shell's back button.
function categoryFromHash(value) {
  return UNIT_CATEGORIES[value] ? value : DEFAULT_CATEGORY;
}

let selectedCategoryKey = categoryFromHash(window.DevToolsMain.readHashState());
let selectedFromUnit = "";
let selectedToUnit = "";
let selectedPrecision = 4;

function getCurrentCategory() {
  return UNIT_CATEGORIES[selectedCategoryKey];
}

function createChip(label, clickHandler, activeClass) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = activeClass;
  button.textContent = label;
  button.addEventListener("click", clickHandler);
  return button;
}

function renderCategoryChips() {
  categoryList.innerHTML = "";

  CATEGORY_GROUPS.forEach((group) => {
    const row = document.createElement("div");
    row.className = "category-group";

    const groupLabel = document.createElement("span");
    groupLabel.className = "category-group-label";
    groupLabel.textContent = group.label;
    row.append(groupLabel);

    const chips = document.createElement("div");
    chips.className = "category-group-chips";

    group.keys.forEach((key) => {
      const category = UNIT_CATEGORIES[key];
      if (!category) return;
      const className = key === selectedCategoryKey ? "category-chip active" : "category-chip";
      const chip = createChip(
        category.label,
        () => {
          if (selectedCategoryKey === key) return;
          window.DevToolsMain.writeHashState(key);
          selectCategory(key);
        },
        className
      );
      chips.append(chip);
    });

    row.append(chips);
    categoryList.append(row);
  });
}

function selectCategory(key) {
  selectedCategoryKey = key;
  renderCategoryChips();
  populateUnits(true);
  convertAndRender();
}

function renderUnitButtons(container, activeUnit, onSelect) {
  const category = getCurrentCategory();
  container.innerHTML = "";

  Object.entries(category.units).forEach(([unitKey, unit]) => {
    const label = `${unit.label} (${unitKey})`;
    const className = unitKey === activeUnit ? "unit-btn active" : "unit-btn";
    const button = createChip(label, () => onSelect(unitKey), className);
    container.append(button);
  });
}

function populateUnits(forceReset = false) {
  const category = getCurrentCategory();
  const unitEntries = Object.entries(category.units);
  const unitKeys = unitEntries.map(([key]) => key);
  const shouldReset =
    forceReset ||
    !unitKeys.includes(selectedFromUnit) ||
    !unitKeys.includes(selectedToUnit) ||
    !selectedFromUnit ||
    !selectedToUnit;

  if (shouldReset) {
    selectedFromUnit = unitKeys[0] || "";
    selectedToUnit = unitKeys[1] || unitKeys[0] || "";
  }

  renderUnitButtons(fromUnitList, selectedFromUnit, handleFromUnitSelect);
  renderUnitButtons(toUnitList, selectedToUnit, handleToUnitSelect);
}

function handleFromUnitSelect(unitKey) {
  selectedFromUnit = unitKey;
  renderUnitButtons(fromUnitList, selectedFromUnit, handleFromUnitSelect);
  convertAndRender();
}

function handleToUnitSelect(unitKey) {
  selectedToUnit = unitKey;
  renderUnitButtons(toUnitList, selectedToUnit, handleToUnitSelect);
  convertAndRender();
}

function showError(message) {
  errorNode.textContent = message;
  errorNode.style.display = message ? "block" : "none";
}

function setPrecision(value) {
  selectedPrecision = value;
  // Open/close, outside click, Escape and keyboard nav all live in the shared
  // .dd component (DevToolsMain.initDropdowns); this only syncs the selection.
  window.DevToolsMain.selectDropdownValue(precisionDropdown, String(value), { emit: false });
  window.DevToolsMain.closeDropdown(precisionDropdown);
}

function bindPrecisionDropdown() {
  precisionDropdown.addEventListener("dd:change", (event) => {
    selectedPrecision = Number(event.detail.value);
    convertAndRender();
  });
}

function createAllResultsMarkup(results, precision, category, sourceUnit) {
  return results
    .filter((entry) => entry.unitKey !== sourceUnit)
    .map((entry) => {
      const unit = category.units[entry.unitKey];
      const displayValue = roundToPrecision(entry.value, precision);

      return `
        <article class="result-row">
          <div class="result-row-unit">${unit.label}</div>
          <div class="result-row-key">${entry.unitKey}</div>
          <div class="result-row-value">${displayValue}</div>
        </article>
      `;
    })
    .join("");
}

function convertAndRender() {
  const validation = parseNumericInput(valueInput.value);
  const precision = selectedPrecision;
  const categoryKey = selectedCategoryKey;
  const fromUnit = selectedFromUnit;
  const toUnit = selectedToUnit;
  const category = UNIT_CATEGORIES[categoryKey];

  if (!validation.valid) {
    showError(validation.error);
    resultNode.textContent = "-";
    resultMetaNode.textContent = "";
    allResultsNode.innerHTML = '<p class="empty-state">Enter a valid number to view conversions.</p>';
    return;
  }

  showError("");

  // Offset scales have a floor; below it every other reading is nonsense
  // (-300 °C used to convert to a negative kelvin value).
  if (categoryKey === "temperature" && convertValue(categoryKey, validation.value, fromUnit, "K") < 0) {
    showError("That is below absolute zero (0 K).");
    resultNode.textContent = "-";
    resultMetaNode.textContent = "";
    allResultsNode.innerHTML = '<p class="empty-state">Enter a temperature at or above absolute zero.</p>';
    return;
  }

  const result = convertValue(categoryKey, validation.value, fromUnit, toUnit);
  resultNode.textContent = roundToPrecision(result, precision);
  resultMetaNode.textContent = `${validation.value} ${fromUnit} = ${roundToPrecision(result, precision)} ${toUnit}`;

  const allResults = convertToAllUnits(categoryKey, validation.value, fromUnit);
  allResultsNode.innerHTML = createAllResultsMarkup(allResults, precision, category, fromUnit);
}

function swapUnits() {
  const fromValue = selectedFromUnit;
  selectedFromUnit = selectedToUnit;
  selectedToUnit = fromValue;
  populateUnits(false);
  convertAndRender();
}

async function copyResult() {
  // Both outcomes used to be silent: nothing to copy did nothing at all, and a
  // refused clipboard only removed a class that was never added.
  if (resultNode.textContent === "-") {
    window.DevToolsMain.showToast("Nothing to copy", "error");
    return;
  }

  try {
    await window.DevToolsMain.copyText(resultMetaNode.textContent || resultNode.textContent);
    copyButton.classList.add("copied");
    setTimeout(() => copyButton.classList.remove("copied"), 1200);
    window.DevToolsMain.showToast("Result copied", "success");
  } catch (error) {
    copyButton.classList.remove("copied");
    window.DevToolsMain.showToast("Copy failed", "error");
  }
}

// Panel resizing is handled by the shared .resizer component in main.js.

function bindEvents() {
  valueInput.addEventListener("input", convertAndRender);
  swapButton.addEventListener("click", swapUnits);
  copyButton.addEventListener("click", copyResult);
  // Deep links and back/forward in the shell re-assign the frame's hash.
  window.DevToolsMain.onHashState((value) => {
    const key = categoryFromHash(value);
    if (key !== selectedCategoryKey) selectCategory(key);
  });
}

function init() {
  renderCategoryChips();
  populateUnits(true);
  bindPrecisionDropdown();
  setPrecision(selectedPrecision);

  bindEvents();

  valueInput.value = "100";
  convertAndRender();
}

init();
