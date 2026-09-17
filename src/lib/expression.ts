import type { EvaluationResult, Input } from "../types";

// 表記ゆれのある演算子を + - * / に正規化する
const OPERATORS: Record<string, string> = {
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

// 貼り付けられたゴミでスタックを掘り尽くさないための括弧のネスト上限
const MAX_DEPTH = 64;

// 計算に関係するトークンだけを取り出したもの
interface Term {
  index: number; // 元のトークン配列におけるインデックス
  kind: "number" | "operator" | "LParen" | "RParen";
  value: number; // kind === "number" のときの数値
  op: string; // kind === "operator" のときの正規化済み記号
}

interface Cursor {
  terms: Term[];
  pos: number;
  depth: number;
}

// value === null は「オペランドが無い」ことを表す。
// indices には実際に採用したトークンのインデックスだけを入れる。
interface ParseResult {
  value: number | null;
  indices: number[];
}

const ABSENT: ParseResult = { value: null, indices: [] };

// 浮動小数点の誤差を落とす。
// 1e10 倍して丸める方法は MAX_SAFE_INTEGER を超える金額で壊れるため使わない。
function roundResult(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toPrecision(12));
}

function toNumber(content: string): number {
  return Number.parseFloat(content.replace(/,/g, ""));
}

// 「円」「¥」「個」などの糊トークンをここで捨てる。
// これにより演算子は単位や通貨記号をまたいで結合できる。
function toTerm(token: Input, index: number): Term | null {
  if (token.contentType === "number") {
    const value = toNumber(token.content);
    return Number.isFinite(value)
      ? { index, kind: "number", value, op: "" }
      : null;
  }
  if (token.contentType === "operator") {
    const op = OPERATORS[token.content];
    return op === undefined ? null : { index, kind: "operator", value: 0, op };
  }
  if (token.contentType === "LParen" || token.contentType === "RParen") {
    return { index, kind: token.contentType, value: 0, op: "" };
  }
  return null;
}

// 改行を境界にして、トークン列を行ごとの Term 列に分割する
function toSegments(tokens: Input[]): Term[][] {
  const segments: Term[][] = [[]];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
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

function isOperator(term: Term | undefined, ops: string[]): boolean {
  return (
    term !== undefined && term.kind === "operator" && ops.includes(term.op)
  );
}

function applyBinary(op: string, left: number, right: number): number | null {
  if (op === "/" && right === 0) {
    return null;
  }
  const result =
    op === "+"
      ? left + right
      : op === "-"
        ? left - right
        : op === "*"
          ? left * right
          : left / right;

  return Number.isFinite(result) ? roundResult(result) : null;
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

  // 括弧。閉じ括弧が無ければ行末で閉じたものとして扱う。
  const start = cursor.pos;
  cursor.pos++;
  cursor.depth++;
  const inner = parseAdditive(cursor);
  cursor.depth--;

  if (inner.value === null) {
    // 中身が無い括弧は「オペランド無し」とし、括弧自体も採用しない
    cursor.pos = start;
    return ABSENT;
  }

  const indices = [term.index, ...inner.indices];
  const closing = peek(cursor);
  if (closing !== undefined && closing.kind === "RParen") {
    cursor.pos++;
    indices.push(closing.index);
  }

  return { value: inner.value, indices };
}

function parseUnary(cursor: Cursor): ParseResult {
  const term = peek(cursor);
  if (!isOperator(term, ["+", "-"]) || term === undefined) {
    return parsePrimary(cursor);
  }

  const start = cursor.pos;
  cursor.pos++;
  const operand = parseUnary(cursor);
  if (operand.value === null) {
    cursor.pos = start;
    return ABSENT;
  }

  return {
    value: term.op === "-" ? -operand.value : operand.value,
    indices: [term.index, ...operand.indices],
  };
}

// 左結合の二項演算。右オペランドが無い演算子、および計算不能な演算子
// （ゼロ除算やオーバーフロー）は、その演算子ごと捨てて左辺を残す。
function parseBinary(
  cursor: Cursor,
  ops: string[],
  parseOperand: (cursor: Cursor) => ParseResult,
): ParseResult {
  const first = parseOperand(cursor);
  if (first.value === null) {
    return first;
  }

  let value = first.value;
  const indices = [...first.indices];

  for (;;) {
    const term = peek(cursor);
    if (!isOperator(term, ops) || term === undefined) {
      break;
    }

    const start = cursor.pos;
    cursor.pos++;
    const right = parseOperand(cursor);
    if (right.value === null) {
      cursor.pos = start;
      break;
    }

    const applied = applyBinary(term.op, value, right.value);
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
  return parseBinary(cursor, ["*", "/"], parseUnary);
}

function parseAdditive(cursor: Cursor): ParseResult {
  return parseBinary(cursor, ["+", "-"], parseMultiplicative);
}

// 1行分を評価する。演算子で繋がっていない式が並んだ場合は、
// それぞれを独立した式として評価し、合計に足し込む。
function evaluateSegment(terms: Term[], includedIndices: Set<number>): number {
  const cursor: Cursor = { terms, pos: 0, depth: 0 };
  let total = 0;

  while (cursor.pos < terms.length) {
    const start = cursor.pos;
    const parsed = parseAdditive(cursor);

    if (parsed.value !== null) {
      total += roundResult(parsed.value);
      for (const index of parsed.indices) {
        includedIndices.add(index);
      }
    }

    // 1トークンも進まなかった場合（空の括弧や余分な閉じ括弧）は
    // 無限ループになるため、強制的に読み飛ばす
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

  return { total: roundResult(total), includedIndices };
}

function calculateArithmeticTotal(tokens: Input[]): number {
  return evaluateTokens(tokens).total;
}

export { calculateArithmeticTotal, evaluateTokens };
