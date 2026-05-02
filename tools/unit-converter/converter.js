function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseNumericInput(rawValue) {
  if (typeof rawValue !== "string") {
    return { valid: false, value: null, error: "Invalid input." };
  }

  const normalized = rawValue.trim();
  if (!normalized) {
    return { valid: false, value: null, error: "Enter a value to convert." };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { valid: false, value: null, error: "Please enter a valid number." };
  }

  return { valid: true, value, error: "" };
}

function roundToPrecision(value, precision) {
  if (!isFiniteNumber(value)) {
    return "-";
  }

  const safePrecision = Number.isInteger(precision) ? Math.max(0, Math.min(12, precision)) : 4;

  const rounded = Number(value.toFixed(safePrecision));
  return rounded.toLocaleString(undefined, {
    maximumFractionDigits: safePrecision
  });
}

function convertTemperature(value, fromUnit, toUnit) {
  let celsius;

  if (fromUnit === "C") {
    celsius = value;
  } else if (fromUnit === "F") {
    celsius = ((value - 32) * 5) / 9;
  } else if (fromUnit === "K") {
    celsius = value - 273.15;
  } else {
    return NaN;
  }

  if (toUnit === "C") {
    return celsius;
  }

  if (toUnit === "F") {
    return (celsius * 9) / 5 + 32;
  }

  if (toUnit === "K") {
    return celsius + 273.15;
  }

  return NaN;
}

function fuelToBase(value, fromUnit) {
  if (fromUnit === "L100km") {
    return value;
  }

  if (value === 0) {
    return Infinity;
  }

  if (fromUnit === "kmpl") {
    return 100 / value;
  }

  if (fromUnit === "mpgUS") {
    return 235.214583 / value;
  }

  if (fromUnit === "mpgUK") {
    return 282.480936 / value;
  }

  return NaN;
}

function baseToFuel(value, toUnit) {
  if (toUnit === "L100km") {
    return value;
  }

  if (value === 0) {
    return Infinity;
  }

  if (toUnit === "kmpl") {
    return 100 / value;
  }

  if (toUnit === "mpgUS") {
    return 235.214583 / value;
  }

  if (toUnit === "mpgUK") {
    return 282.480936 / value;
  }

  return NaN;
}

function convertFuelEconomy(value, fromUnit, toUnit) {
  const baseValue = fuelToBase(value, fromUnit);
  if (!isFiniteNumber(baseValue) && baseValue !== Infinity) {
    return NaN;
  }

  return baseToFuel(baseValue, toUnit);
}

function convertByFactor(value, fromUnit, toUnit, units) {
  const from = units[fromUnit];
  const to = units[toUnit];

  if (!from || !to) {
    return NaN;
  }

  const baseValue = value * from.factor;
  return baseValue / to.factor;
}

function convertValue(categoryKey, value, fromUnit, toUnit) {
  const category = UNIT_CATEGORIES[categoryKey];
  if (!category) {
    return NaN;
  }

  if (category.type === "factor") {
    return convertByFactor(value, fromUnit, toUnit, category.units);
  }

  if (categoryKey === "temperature") {
    return convertTemperature(value, fromUnit, toUnit);
  }

  if (categoryKey === "fuelEconomy") {
    return convertFuelEconomy(value, fromUnit, toUnit);
  }

  return NaN;
}

function convertToAllUnits(categoryKey, value, fromUnit) {
  const category = UNIT_CATEGORIES[categoryKey];
  if (!category) {
    return [];
  }

  return Object.keys(category.units).map((unitKey) => ({
    unitKey,
    value: convertValue(categoryKey, value, fromUnit, unitKey)
  }));
}
