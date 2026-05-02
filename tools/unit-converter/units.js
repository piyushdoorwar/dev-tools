const UNIT_CATEGORIES = {
  length: {
    label: "Length / Distance",
    type: "factor",
    baseUnit: "m",
    units: {
      mm: { label: "Millimeter", factor: 0.001 },
      cm: { label: "Centimeter", factor: 0.01 },
      m: { label: "Meter", factor: 1 },
      km: { label: "Kilometer", factor: 1000 },
      in: { label: "Inch", factor: 0.0254 },
      ft: { label: "Foot", factor: 0.3048 },
      yd: { label: "Yard", factor: 0.9144 },
      mi: { label: "Mile", factor: 1609.344 },
      nmi: { label: "Nautical Mile", factor: 1852 }
    }
  },
  area: {
    label: "Area",
    type: "factor",
    baseUnit: "m2",
    units: {
      mm2: { label: "Square Millimeter", factor: 0.000001 },
      cm2: { label: "Square Centimeter", factor: 0.0001 },
      m2: { label: "Square Meter", factor: 1 },
      ha: { label: "Hectare", factor: 10000 },
      km2: { label: "Square Kilometer", factor: 1000000 },
      in2: { label: "Square Inch", factor: 0.00064516 },
      ft2: { label: "Square Foot", factor: 0.09290304 },
      yd2: { label: "Square Yard", factor: 0.83612736 },
      ac: { label: "Acre", factor: 4046.8564224 },
      mi2: { label: "Square Mile", factor: 2589988.110336 }
    }
  },
  volume: {
    label: "Volume / Liquid",
    type: "factor",
    baseUnit: "L",
    units: {
      mL: { label: "Milliliter", factor: 0.001 },
      cL: { label: "Centiliter", factor: 0.01 },
      L: { label: "Liter", factor: 1 },
      m3: { label: "Cubic Meter", factor: 1000 },
      tspUS: { label: "US Teaspoon", factor: 0.00492892159375 },
      tbspUS: { label: "US Tablespoon", factor: 0.01478676478125 },
      flOzUS: { label: "US Fluid Ounce", factor: 0.0295735295625 },
      cupUS: { label: "US Cup", factor: 0.2365882365 },
      ptUS: { label: "US Pint", factor: 0.473176473 },
      galUS: { label: "US Gallon", factor: 3.785411784 },
      flOzUK: { label: "UK Fluid Ounce", factor: 0.0284130625 },
      ptUK: { label: "UK Pint", factor: 0.56826125 },
      galUK: { label: "UK Gallon", factor: 4.54609 }
    }
  },
  weight: {
    label: "Weight / Mass",
    type: "factor",
    baseUnit: "kg",
    units: {
      mg: { label: "Milligram", factor: 0.000001 },
      g: { label: "Gram", factor: 0.001 },
      kg: { label: "Kilogram", factor: 1 },
      t: { label: "Metric Ton", factor: 1000 },
      oz: { label: "Ounce", factor: 0.028349523125 },
      lb: { label: "Pound", factor: 0.45359237 },
      st: { label: "Stone", factor: 6.35029318 },
      tonUS: { label: "US Ton", factor: 907.18474 },
      tonUK: { label: "UK Ton", factor: 1016.0469088 }
    }
  },
  temperature: {
    label: "Temperature",
    type: "formula",
    baseUnit: "C",
    units: {
      C: { label: "Celsius" },
      F: { label: "Fahrenheit" },
      K: { label: "Kelvin" }
    }
  },
  time: {
    label: "Time",
    type: "factor",
    baseUnit: "s",
    units: {
      ms: { label: "Millisecond", factor: 0.001 },
      s: { label: "Second", factor: 1 },
      epoch: { label: "Epoch (Unix, s)", factor: 1 },
      min: { label: "Minute", factor: 60 },
      h: { label: "Hour", factor: 3600 },
      d: { label: "Day", factor: 86400 },
      wk: { label: "Week", factor: 604800 }
    }
  },
  speed: {
    label: "Speed",
    type: "factor",
    baseUnit: "mps",
    units: {
      mps: { label: "Meters/Second", factor: 1 },
      kph: { label: "Kilometers/Hour", factor: 0.2777777777778 },
      mph: { label: "Miles/Hour", factor: 0.44704 },
      fps: { label: "Feet/Second", factor: 0.3048 },
      knot: { label: "Knot", factor: 0.5144444444444 }
    }
  },
  data: {
    label: "Data / Digital Storage",
    type: "factor",
    baseUnit: "B",
    units: {
      b: { label: "Bit", factor: 0.125 },
      B: { label: "Byte", factor: 1 },
      KB: { label: "Kilobyte (Decimal)", factor: 1000 },
      MB: { label: "Megabyte (Decimal)", factor: 1000000 },
      GB: { label: "Gigabyte (Decimal)", factor: 1000000000 },
      TB: { label: "Terabyte (Decimal)", factor: 1000000000000 },
      KiB: { label: "Kibibyte (Binary)", factor: 1024 },
      MiB: { label: "Mebibyte (Binary)", factor: 1048576 },
      GiB: { label: "Gibibyte (Binary)", factor: 1073741824 },
      TiB: { label: "Tebibyte (Binary)", factor: 1099511627776 }
    }
  },
  energy: {
    label: "Energy",
    type: "factor",
    baseUnit: "J",
    units: {
      J: { label: "Joule", factor: 1 },
      kJ: { label: "Kilojoule", factor: 1000 },
      cal: { label: "Calorie", factor: 4.184 },
      kcal: { label: "Kilocalorie", factor: 4184 },
      Wh: { label: "Watt-hour", factor: 3600 },
      kWh: { label: "Kilowatt-hour", factor: 3600000 },
      eV: { label: "Electronvolt", factor: 1.602176634e-19 },
      BTU: { label: "BTU (IT)", factor: 1055.05585262 }
    }
  },
  power: {
    label: "Power",
    type: "factor",
    baseUnit: "W",
    units: {
      W: { label: "Watt", factor: 1 },
      kW: { label: "Kilowatt", factor: 1000 },
      MW: { label: "Megawatt", factor: 1000000 },
      hp: { label: "Horsepower (Mechanical)", factor: 745.6998715823 },
      BTUph: { label: "BTU/hour", factor: 0.2930710701722 }
    }
  },
  angle: {
    label: "Angle",
    type: "factor",
    baseUnit: "rad",
    units: {
      deg: { label: "Degree", factor: 0.017453292519943 },
      rad: { label: "Radian", factor: 1 },
      grad: { label: "Gradian", factor: 0.015707963267949 },
      arcmin: { label: "Arcminute", factor: 0.00029088820866572 },
      arcsec: { label: "Arcsecond", factor: 0.0000048481368110954 },
      turn: { label: "Turn", factor: 6.2831853071796 }
    }
  },
  fuelEconomy: {
    label: "Fuel Economy",
    type: "formula",
    baseUnit: "L100km",
    units: {
      L100km: { label: "Liters / 100 km" },
      kmpl: { label: "Kilometers / Liter" },
      mpgUS: { label: "Miles / Gallon (US)" },
      mpgUK: { label: "Miles / Gallon (UK)" }
    }
  }
};

const DEFAULT_CATEGORY = "length";

const CATEGORY_GROUPS = [
  {
    label: "Dimensions",
    keys: ["length", "area", "volume", "angle"]
  },
  {
    label: "Mass & Motion",
    keys: ["weight", "speed", "fuelEconomy"]
  },
  {
    label: "Science",
    keys: ["temperature", "energy", "power"]
  },
  {
    label: "Digital & Time",
    keys: ["data", "time"]
  }
];
