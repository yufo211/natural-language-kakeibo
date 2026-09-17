import type { EvaluationResult, Input } from "../types";

type Operator = "+" | "-" | "*" | "/";

const OPERATOR_ALIASES: Record<string, Operator> = {
  "+": "+",
  "＋": "+",
  "-": "-",
  "－": "-",
  "−": "-",
  "*": "*",
  "＊": "*",
  "×": "*",
  "✕": "*",
  "✖": "*",
  "/": "/",
  "／": "/",
  "÷": "/",
};

const BINARY_OPERATIONS: Record<
  Operator,
  (left: number, right: number) => number
> = {
  "+": (left, right) => left + right,
  "-": (left, right) => left - right,
  "*": (left, right) => left * right,
  "/": (left, right) => left / right,
};

const ADDITIVE: Operator[] = ["+", "-"];
const MULTIPLICATIVE: Operator[] = ["*", "/"];

// 貼り付けられたゴミでスタックを掘り尽くさないための括弧のネスト上限
const MAX_DEPTH = 64;

type Term =
  | { index: number; kind: "number"; value: number }
  | { index: number; kind: "operator"; op: Operator }
  | { index: number; kind: "LParen" | "RParen" };

type OperatorTerm = Extract<Term, { kind: "operator" }>;

interface Cursor {
  terms: Term[];
  pos: number;
  depth: number;
}

// value === null は「オペランドが無い」ことを表す
interface ParseResult {
  value: number | null;
  indices: readonly number[];
}

const ABSENT: ParseResult = { value: null, indices: [] };

// 1e10 倍して丸める方法は MAX_SAFE_INTEGER を超える金額で壊れるため使わない
function round(value: number): number | null {
  return Number.isFinite(value) ? Number(value.toPrecision(12)) : null;
}

// 「円」「¥」「個」などの糊トークンをここで捨てることで、
// 演算子が単位や通貨記号をまたいで結合できるようになる
function toTerm(token: Input, index: number): Term | null {
  switch (token.contentType) {
    case "number": {
      const value = Number.parseFloat(token.content.replace(/,/g, ""));
      return Number.isFinite(value) ? { index, kind: "number", value } : null;
    }
    case "operator": {
      const op = OPERATOR_ALIASES[token.content];
      return op === undefined ? null : { index, kind: "operator", op };
    }
    case "LParen":
    case "RParen":
      return { index, kind: token.contentType };
    default:
      return null;
  }
}

function toSegments(tokens: Input[]): Term[][] {
  const segments: Term[][] = [[]];

  for (const [index, token] of tokens.entries()) {
    if (token.contentType === "LF") {
      segments.push([]);
      continue;
    }
    const term = toTerm(token, index);
    if (term !== null) {
      segments[segments.length - 1].push(term);
    }
  }

  return segments;
}

function peek(cursor: Cursor): Term | undefined {
  return cursor.terms[cursor.pos];
}

function isOperator(
  term: Term | undefined,
  ops: Operator[],
): term is OperatorTerm {
  return (
    term !== undefined && term.kind === "operator" && ops.includes(term.op)
  );
}

function parsePrimary(cursor: Cursor): ParseResult {
  const term = peek(cursor);
  if (term === undefined) {
    return ABSENT;
  }

  if (term.kind === "number") {
    cursor.pos++;
    return { value: term.value, indices: [term.index] };
  }

  if (term.kind !== "LParen" || cursor.depth >= MAX_DEPTH) {
    return ABSENT;
  }

  const start = cursor.pos;
  cursor.pos++;
  cursor.depth++;
  const inner = parseAdditive(cursor);
  cursor.depth--;

  // 中身が無い括弧はオペランドとして使えないので、括弧ごと採用しない
  if (inner.value === null) {
    cursor.pos = start;
    return ABSENT;
  }

  const indices = [term.index, ...inner.indices];
  const closing = peek(cursor);
  // 閉じ括弧が無ければ、行末で閉じられたものとして扱う
  if (closing?.kind === "RParen") {
    cursor.pos++;
    indices.push(closing.index);
  }

  return { value: inner.value, indices };
}

// 符号は再帰ではなく畳み込みで処理する。「-----」のような記号の羅列を
// 貼り付けられてもスタックを溢れさせないため。
function parseUnary(cursor: Cursor): ParseResult {
  const start = cursor.pos;
  const signIndices: number[] = [];
  let negative = false;

  for (
    let term = peek(cursor);
    isOperator(term, ADDITIVE);
    term = peek(cursor)
  ) {
    if (term.op === "-") {
      negative = !negative;
    }
    signIndices.push(term.index);
    cursor.pos++;
  }

  const operand = parsePrimary(cursor);
  if (operand.value === null) {
    cursor.pos = start;
    return ABSENT;
  }

  return {
    value: negative ? -operand.value : operand.value,
    indices: [...signIndices, ...operand.indices],
  };
}

function parseBinary(
  cursor: Cursor,
  ops: Operator[],
  parseOperand: (cursor: Cursor) => ParseResult,
): ParseResult {
  const first = parseOperand(cursor);
  if (first.value === null) {
    return first;
  }

  let value = first.value;
  const indices: number[] = [...first.indices];

  for (;;) {
    const term = peek(cursor);
    if (!isOperator(term, ops)) {
      break;
    }

    const start = cursor.pos;
    cursor.pos++;
    const right = parseOperand(cursor);
    const applied =
      right.value === null
        ? null
        : round(BINARY_OPERATIONS[term.op](value, right.value));

    // 右オペランドの無い演算子とゼロ除算・オーバーフローは、演算子ごと捨てて左辺を残す
    if (applied === null) {
      cursor.pos = start;
      break;
    }

    value = applied;
    indices.push(term.index, ...right.indices);
  }

  return { value, indices };
}

function parseMultiplicative(cursor: Cursor): ParseResult {
  return parseBinary(cursor, MULTIPLICATIVE, parseUnary);
}

function parseAdditive(cursor: Cursor): ParseResult {
  return parseBinary(cursor, ADDITIVE, parseMultiplicative);
}

// 演算子で繋がっていない式が並んだ場合は、それぞれ独立した式として合計に足し込む
function evaluateSegment(terms: Term[], includedIndices: Set<number>): number {
  const cursor: Cursor = { terms, pos: 0, depth: 0 };
  let total = 0;

  while (cursor.pos < terms.length) {
    const start = cursor.pos;
    const { value, indices } = parseAdditive(cursor);

    if (value !== null) {
      total += value;
      for (const index of indices) {
        includedIndices.add(index);
      }
    }

    // 空の括弧や余分な閉じ括弧では1トークンも進まないため、
    // 無限ループを避けて強制的に読み飛ばす
    if (cursor.pos === start) {
      cursor.pos++;
    }
  }

  return total;
}

function evaluateTokens(tokens: Input[]): EvaluationResult {
  const includedIndices = new Set<number>();
  let total = 0;

  for (const segment of toSegments(tokens)) {
    total += evaluateSegment(segment, includedIndices);
  }

  return { total: round(total) ?? 0, includedIndices };
}

export { evaluateTokens };
