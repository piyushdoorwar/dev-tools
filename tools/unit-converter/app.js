const categoryList = document.getElementById("category-list");
const precisionDropdown = document.getElementById("precision-dropdown");
const precisionTrigger = document.getElementById("precision-trigger");
const precisionMenu = document.getElementById("precision-menu");
const precisionValue = document.getElementById("precision-value");
const valueInput = document.getElementById("value-input");
const fromUnitList = document.getElementById("from-unit-list");
const toUnitList = document.getElementById("to-unit-list");
const swapButton = document.getElementById("swap-units");
const copyButton = document.getElementById("copy-result");
const resultNode = document.getElementById("result");
const resultMetaNode = document.getElementById("result-meta");
const allResultsNode = document.getElementById("all-results");
const errorNode = document.getElementById("error");
const resizer = document.getElementById("resizer");
const workspace = document.querySelector(".workspace");
const leftPanel = document.querySelector(".panel");

let isResizing = false;
let selectedCategoryKey = (function () {
  const hash = window.location.hash.slice(1);
  return UNIT_CATEGORIES[hash] ? hash : DEFAULT_CATEGORY;
})();
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
          selectedCategoryKey = key;
          window.location.hash = key;
          renderCategoryChips();
          populateUnits(true);
          convertAndRender();
        },
        className
      );
      chips.append(chip);
    });

    row.append(chips);
    categoryList.append(row);
  });
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
  precisionValue.textContent = String(value);

  precisionMenu.querySelectorAll(".precision-option").forEach((option) => {
    const isActive = Number(option.dataset.value) === value;
    option.classList.toggle("active", isActive);
    if (isActive) {
      option.setAttribute("aria-selected", "true");
    } else {
      option.removeAttribute("aria-selected");
    }
  });

  precisionDropdown.classList.remove("open");
  precisionTrigger.setAttribute("aria-expanded", "false");
}

function bindPrecisionDropdown() {
  precisionTrigger.addEventListener("click", () => {
    const isOpen = precisionDropdown.classList.toggle("open");
    precisionTrigger.setAttribute("aria-expanded", String(isOpen));
  });

  precisionMenu.querySelectorAll(".precision-option").forEach((option) => {
    option.addEventListener("click", () => {
      setPrecision(Number(option.dataset.value));
      convertAndRender();
    });
  });

  document.addEventListener("click", (event) => {
    if (!precisionDropdown.contains(event.target)) {
      precisionDropdown.classList.remove("open");
      precisionTrigger.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      precisionDropdown.classList.remove("open");
      precisionTrigger.setAttribute("aria-expanded", "false");
    }
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
  if (resultNode.textContent === "-") {
    return;
  }

  try {
    await navigator.clipboard.writeText(resultMetaNode.textContent || resultNode.textContent);
    copyButton.classList.add("copied");
    setTimeout(() => copyButton.classList.remove("copied"), 1200);
  } catch (error) {
    copyButton.classList.remove("copied");
  }
}

function initializeResize() {
  resizer.addEventListener("mousedown", () => {
    isResizing = true;
    resizer.classList.add("resizing");
  });

  document.addEventListener("mousemove", (event) => {
    if (!isResizing || window.innerWidth < 1024) {
      return;
    }

    const workspaceRect = workspace.getBoundingClientRect();
    const minWidth = 280;
    const maxWidth = workspaceRect.width - minWidth;
    const proposedLeft = event.clientX - workspaceRect.left;
    const boundedLeft = Math.max(minWidth, Math.min(proposedLeft, maxWidth));

    leftPanel.style.flex = "0 0 auto";
    leftPanel.style.width = `${boundedLeft}px`;
  });

  document.addEventListener("mouseup", () => {
    isResizing = false;
    resizer.classList.remove("resizing");
  });
}

function bindEvents() {
  valueInput.addEventListener("input", convertAndRender);
  swapButton.addEventListener("click", swapUnits);
  copyButton.addEventListener("click", copyResult);
}

function init() {
  renderCategoryChips();
  populateUnits(true);
  bindPrecisionDropdown();
  setPrecision(selectedPrecision);

  bindEvents();
  initializeResize();

  valueInput.value = "100";
  convertAndRender();
}

init();
