/* A bounded arithmetic grammar. Never evaluates JavaScript or property access. */
globalThis.evaluateExpression = function evaluateExpression(source) {
  if (source.length > 2000)
    throw Error("Expression is limited to 2,000 characters.");
  const tokens =
    source.match(
      /(?:0[xX][\da-fA-F]+n?|0[bB][01]+n?|\d+n|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9]*|\*\*|[^\s])/g,
    ) || [];
  let index = 0;
  const functions = {
    sqrt: [Math.sqrt, 1],
    log: [Math.log, 1],
    log10: [Math.log10, 1],
    sin: [Math.sin, 1],
    cos: [Math.cos, 1],
    tan: [Math.tan, 1],
    abs: [Math.abs, 1],
    floor: [Math.floor, 1],
    ceil: [Math.ceil, 1],
    round: [Math.round, 1],
    min: [Math.min, -1],
    max: [Math.max, -1],
  };
  const peek = () => tokens[index];
  function bounded(value) {
    if (typeof value === "number" && !Number.isFinite(value))
      throw Error("Result is not a finite real number.");
    if (typeof value === "bigint" && value.toString(2).length > 20000)
      throw Error("BigInt result exceeds 20,000 bits.");
    return value;
  }
  function atom() {
    const token = tokens[index++];
    if (token === "(") {
      const v = expression();
      if (tokens[index++] !== ")") throw Error("Missing closing parenthesis.");
      return v;
    }
    if (token === "pi") return Math.PI;
    if (token === "e") return Math.E;
    if (Object.hasOwn(functions, token)) {
      if (tokens[index++] !== "(")
        throw Error("Function requires parentheses.");
      const args = [expression()];
      while (peek() === ",") {
        index++;
        args.push(expression());
      }
      if (tokens[index++] !== ")") throw Error("Missing closing parenthesis.");
      const [fn, arity] = functions[token];
      if (arity !== -1 && args.length !== arity)
        throw Error(`${token} expects ${arity} argument.`);
      if (args.some((v) => typeof v === "bigint"))
        throw Error("Functions require numbers, not BigInt.");
      return bounded(fn(...args));
    }
    if (token && /^(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)n$/.test(token))
      return bounded(BigInt(token.slice(0, -1)));
    if (
      token &&
      /^(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/.test(
        token,
      )
    )
      return bounded(Number(token));
    throw Error("Expected a number, constant, function, or parenthesis.");
  }
  function binary(a, op, b) {
    if (typeof a !== typeof b) throw Error("Do not mix BigInt and numbers.");
    if (
      (op === "^" || op === "**") &&
      typeof b === "bigint" &&
      (b < 0n || b > 20000n)
    )
      throw Error("BigInt exponent must be between 0 and 20,000.");
    if (
      (op === "^" || op === "**") &&
      typeof a === "bigint" &&
      a !== 0n &&
      a !== 1n &&
      a !== -1n &&
      BigInt((a < 0n ? -a : a).toString(2).length) * b > 20000n
    )
      throw Error("BigInt power exceeds the 20,000-bit calculation budget.");
    if ((op === "/" || op === "%") && (b === 0 || b === 0n))
      throw Error("Cannot divide by zero.");
    return bounded(
      op === "+"
        ? a + b
        : op === "-"
          ? a - b
          : op === "*"
            ? a * b
            : op === "/"
              ? a / b
              : op === "%"
                ? a % b
                : a ** b,
    );
  }
  function power() {
    const a = atom();
    if (peek() === "^" || peek() === "**") {
      const op = tokens[index++];
      return binary(a, op, unary());
    }
    return a;
  }
  function unary() {
    if (peek() === "+" || peek() === "-") {
      const op = tokens[index++],
        v = unary();
      return op === "-" ? -v : v;
    }
    return power();
  }
  function product() {
    let a = unary();
    while (["*", "/", "%"].includes(peek())) {
      const op = tokens[index++];
      a = binary(a, op, unary());
    }
    return a;
  }
  function expression() {
    let a = product();
    while (["+", "-"].includes(peek())) {
      const op = tokens[index++];
      a = binary(a, op, product());
    }
    return a;
  }
  const result = expression();
  if (index !== tokens.length) throw Error("Unexpected token: " + peek());
  return result;
};
