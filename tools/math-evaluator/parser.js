/* Math / Expression Evaluator — a bounded arithmetic grammar.
 *
 * This is a hand-written recursive-descent parser over a fixed token set.
 * It never evaluates JavaScript, never looks up properties and never calls
 * anything outside the FUNCTIONS table below, so `alert(1)` or
 * `constructor` are simply unknown names.
 *
 * Every dimension is bounded: source length, nesting depth, BigInt size,
 * exponent and factorial operands. Errors carry a character position so the
 * UI can point at the problem.
 *
 *   expression := product (("+" | "-") product)*
 *   product    := unary (("*" | "/" | "%") unary)*
 *   unary      := ("+" | "-") unary | power
 *   power      := postfix (("^" | "**") unary)?      right-associative
 *   postfix    := atom "!"*
 *   atom       := number | constant | name "(" args ")" | "(" expression ")"
 *
 * Because unary sits above power, -2^2 is -(2^2) = -4, and because the right
 * operand of ^ is a unary, 2^3^2 is 2^(3^2) = 512 and 2^-1 is 0.5.
 */
(function (root) {
  "use strict";

  const LIMITS = Object.freeze({
    length: 2000,
    depth: 100,
    bigintBits: 20000,
    bigintExponent: 20000n,
    factorial: 170,
    bigintFactorial: 2000n,
  });

  class MathError extends Error {
    constructor(message, position) {
      super(message);
      this.name = "MathError";
      this.position = position;
    }
  }

  const TOKEN =
    /\s+|(0[xX][\da-fA-F]+n?|0[bB][01]+n?|0[oO][0-7]+n?|\d+n|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([a-zA-Z_][a-zA-Z0-9_]*)|(\*\*|[-+*/%^(),!])/y;

  function tokenize(source) {
    const tokens = [];
    TOKEN.lastIndex = 0;
    while (TOKEN.lastIndex < source.length) {
      const position = TOKEN.lastIndex;
      const match = TOKEN.exec(source);
      if (!match) {
        const character = String.fromCodePoint(source.codePointAt(position));
        throw new MathError(`Unexpected character “${character}”.`, position);
      }
      if (match[1]) tokens.push({ type: "number", text: match[1], position });
      else if (match[2]) tokens.push({ type: "name", text: match[2], position });
      else if (match[3]) tokens.push({ type: "op", text: match[3], position });
    }
    tokens.push({ type: "end", text: "", position: source.length });
    return tokens;
  }

  const DEG = Math.PI / 180;
  const CONSTANTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

  // Degree mode: multiples of 90° are exact, so sin(180) is 0 rather than
  // 1.2e-16 and tan(90) is an error rather than 1.6e16.
  const QUARTER = {
    sin: [0, 1, 0, -1],
    cos: [1, 0, -1, 0],
    tan: [0, null, 0, null],
  };
  function trig(name, x, angle) {
    if (angle === "deg") {
      const turned = ((x % 360) + 360) % 360;
      if (turned % 90 === 0) {
        const exact = QUARTER[name][turned / 90];
        if (exact === null) throw new Error(`tan is undefined at ${x}°.`);
        return exact;
      }
      return Math[name](x * DEG);
    }
    return Math[name](x);
  }
  const inverse = (fn) => (angle, ...args) => {
    const radians = fn(...args);
    return angle === "deg" ? radians / DEG : radians;
  };
  const plain = (fn) => (_angle, ...args) => fn(...args);

  // [implementation, minimum arguments, maximum arguments]
  const FUNCTIONS = {
    sqrt: [plain(Math.sqrt), 1, 1],
    cbrt: [plain(Math.cbrt), 1, 1],
    exp: [plain(Math.exp), 1, 1],
    log: [plain(Math.log), 1, 1],
    ln: [plain(Math.log), 1, 1],
    log10: [plain(Math.log10), 1, 1],
    log2: [plain(Math.log2), 1, 1],
    sin: [(angle, x) => trig("sin", x, angle), 1, 1],
    cos: [(angle, x) => trig("cos", x, angle), 1, 1],
    tan: [(angle, x) => trig("tan", x, angle), 1, 1],
    asin: [inverse(Math.asin), 1, 1],
    acos: [inverse(Math.acos), 1, 1],
    atan: [inverse(Math.atan), 1, 1],
    atan2: [inverse(Math.atan2), 2, 2],
    sinh: [plain(Math.sinh), 1, 1],
    cosh: [plain(Math.cosh), 1, 1],
    tanh: [plain(Math.tanh), 1, 1],
    abs: [plain(Math.abs), 1, 1],
    sign: [plain(Math.sign), 1, 1],
    floor: [plain(Math.floor), 1, 1],
    ceil: [plain(Math.ceil), 1, 1],
    round: [plain(Math.round), 1, 1],
    trunc: [plain(Math.trunc), 1, 1],
    pow: [plain(Math.pow), 2, 2],
    hypot: [plain(Math.hypot), 1, 64],
    min: [plain(Math.min), 1, 64],
    max: [plain(Math.max), 1, 64],
  };

  // A few functions have an exact BigInt meaning; the rest need numbers.
  const BIGINT_FUNCTIONS = {
    abs: (x) => (x < 0n ? -x : x),
    sign: (x) => (x > 0n ? 1n : x < 0n ? -1n : 0n),
    min: (...xs) => xs.reduce((a, b) => (b < a ? b : a)),
    max: (...xs) => xs.reduce((a, b) => (b > a ? b : a)),
  };

  const bitLength = (x) => (x < 0n ? -x : x).toString(2).length;

  function evaluate(source, options = {}) {
    const angle = options.angle === "deg" ? "deg" : "rad";
    const text = String(source);
    if (text.length > LIMITS.length)
      throw new MathError("Expression is limited to 2,000 characters.", LIMITS.length);
    const tokens = tokenize(text);
    let index = 0;
    let depth = 0;

    const peek = () => tokens[index];
    const next = () => tokens[index++];

    function enter(token) {
      if (++depth > LIMITS.depth)
        throw new MathError("Expression is nested too deeply (limit 100).", token.position);
    }

    function finite(value, token) {
      if (typeof value === "number") {
        if (Number.isNaN(value))
          throw new MathError("Result is not a real number.", token.position);
        if (!Number.isFinite(value))
          throw new MathError("Result is not finite (it overflows).", token.position);
      } else if (bitLength(value) > LIMITS.bigintBits) {
        throw new MathError("BigInt result exceeds 20,000 bits.", token.position);
      }
      return value;
    }

    function expect(text, message, opener) {
      const token = next();
      if (token.text !== text)
        throw new MathError(message, token.type === "end" && opener ? opener.position : token.position);
      return token;
    }

    function call(nameToken) {
      const name = nameToken.text;
      const open = next();
      if (open.text !== "(")
        throw new MathError(`${name} needs parentheses, like ${name}(x).`, open.position);
      const args = [];
      if (peek().text !== ")") {
        args.push(expression());
        while (peek().text === ",") {
          next();
          args.push(expression());
        }
      }
      expect(")", `Missing “)” to close ${name}(.`, open);
      const [fn, min, max] = FUNCTIONS[name];
      if (args.length < min || args.length > max) {
        const expected = min === max ? `${min} argument${min === 1 ? "" : "s"}` : `${min} to ${max} arguments`;
        throw new MathError(`${name} expects ${expected}.`, nameToken.position);
      }
      const bigints = args.filter((value) => typeof value === "bigint").length;
      if (bigints) {
        if (bigints === args.length && Object.hasOwn(BIGINT_FUNCTIONS, name))
          return BIGINT_FUNCTIONS[name](...args);
        throw new MathError(`${name} needs ordinary numbers, not BigInt.`, nameToken.position);
      }
      let value;
      try {
        value = fn(angle, ...args);
      } catch (error) {
        throw new MathError(error.message, nameToken.position);
      }
      if (Number.isNaN(value))
        throw new MathError(`${name} has no real result for that input.`, nameToken.position);
      return finite(value, nameToken);
    }

    function atom() {
      const token = next();
      if (token.text === "(") {
        enter(token);
        const value = expression();
        expect(")", "Missing closing parenthesis.", token);
        depth--;
        return value;
      }
      if (token.type === "number") {
        if (token.text.endsWith("n")) return finite(BigInt(token.text.slice(0, -1)), token);
        return finite(Number(token.text), token);
      }
      if (token.type === "name") {
        const name = token.text;
        if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name];
        if (Object.hasOwn(FUNCTIONS, name)) {
          enter(token);
          const value = call(token);
          depth--;
          return value;
        }
        throw new MathError(`Unknown name “${name}”.`, token.position);
      }
      if (token.type === "end")
        throw new MathError("Expression ends early; a value is missing.", token.position);
      throw new MathError(`Expected a value before “${token.text}”.`, token.position);
    }

    function factorial(value, token) {
      if (typeof value === "bigint") {
        if (value < 0n) throw new MathError("Factorial needs a non-negative integer.", token.position);
        if (value > LIMITS.bigintFactorial)
          throw new MathError("BigInt factorial is limited to 2000n!.", token.position);
        let product = 1n;
        for (let i = 2n; i <= value; i++) product *= i;
        return finite(product, token);
      }
      if (!Number.isInteger(value) || value < 0)
        throw new MathError("Factorial needs a non-negative integer.", token.position);
      if (value > LIMITS.factorial)
        throw new MathError("Factorial is limited to 170! (use 171n! and up for BigInt).", token.position);
      let product = 1;
      for (let i = 2; i <= value; i++) product *= i;
      return product;
    }

    function postfix() {
      let value = atom();
      while (peek().text === "!") value = factorial(value, next());
      return value;
    }

    function binary(a, opToken, b) {
      const op = opToken.text;
      if (typeof a !== typeof b)
        throw new MathError("Do not mix BigInt and ordinary numbers.", opToken.position);
      if ((op === "/" || op === "%") && (b === 0 || b === 0n))
        throw new MathError("Cannot divide by zero.", opToken.position);
      if (op === "^" || op === "**") {
        if (typeof b === "bigint") {
          if (b < 0n || b > LIMITS.bigintExponent)
            throw new MathError("BigInt exponent must be between 0 and 20,000.", opToken.position);
          if (a !== 0n && a !== 1n && a !== -1n && BigInt(bitLength(a)) * b > BigInt(LIMITS.bigintBits))
            throw new MathError("BigInt power exceeds the 20,000-bit budget.", opToken.position);
        }
        return finite(a ** b, opToken);
      }
      const value =
        op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? a / b : a % b;
      return finite(value, opToken);
    }

    function power() {
      const base = postfix();
      if (peek().text === "^" || peek().text === "**") {
        const op = next();
        return binary(base, op, unary());
      }
      return base;
    }

    function unary() {
      const token = peek();
      if (token.text === "+" || token.text === "-") {
        next();
        enter(token);
        const value = unary();
        depth--;
        return token.text === "-" ? -value : value;
      }
      return power();
    }

    function product() {
      let value = unary();
      while (["*", "/", "%"].includes(peek().text)) {
        const op = next();
        value = binary(value, op, unary());
      }
      return value;
    }

    function expression() {
      let value = product();
      while (peek().text === "+" || peek().text === "-") {
        const op = next();
        value = binary(value, op, product());
      }
      return value;
    }

    if (peek().type === "end") throw new MathError("Enter an expression.", 0);
    const result = expression();
    const rest = peek();
    if (rest.type !== "end") {
      const message =
        rest.text === ")" ? "Unmatched closing parenthesis." : `Unexpected “${rest.text}”.`;
      throw new MathError(message, rest.position);
    }
    // -0 displays as 0; it is not a meaningful result here.
    return Object.is(result, -0) ? 0 : result;
  }

  /* --- Display ------------------------------------------------------------ */

  // Binary floating point cannot hold 0.1 exactly, so 0.1 + 0.2 is
  // 0.30000000000000004. Fifteen significant digits is the most a double
  // always round-trips from decimal, so rounding there hides the noise
  // without hiding real digits. The exact value stays available separately.
  function format(value) {
    if (typeof value === "bigint") return `${value}n`;
    if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
    const cleaned = Number(value.toPrecision(15));
    return String(Object.is(cleaned, -0) ? 0 : cleaned);
  }

  function exact(value) {
    return typeof value === "bigint" ? `${value}n` : String(value);
  }

  // Integer results also read in other bases. Floats above 2^53 are not
  // integers in any useful sense, so only safe integers and BigInts qualify.
  function bases(value) {
    let integer;
    if (typeof value === "bigint") integer = value;
    else if (Number.isSafeInteger(value)) integer = BigInt(value);
    else return null;
    const sign = integer < 0n ? "-" : "";
    const magnitude = integer < 0n ? -integer : integer;
    return {
      hex: `${sign}0x${magnitude.toString(16)}`,
      octal: `${sign}0o${magnitude.toString(8)}`,
      binary: `${sign}0b${magnitude.toString(2)}`,
    };
  }

  root.MathEvaluator = Object.freeze({
    evaluate,
    format,
    exact,
    bases,
    MathError,
    LIMITS,
    FUNCTIONS: Object.freeze(Object.keys(FUNCTIONS)),
    CONSTANTS: Object.freeze(Object.keys(CONSTANTS)),
  });
  // Kept for anything that still calls the original global.
  root.evaluateExpression = (source, options) => evaluate(source, options);
})(globalThis);
