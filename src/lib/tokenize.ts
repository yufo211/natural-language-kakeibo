import type { Input } from "../types";

// 通常モードの正規表現パターン
// (¥) → 円マーク
// (円) → 円
// ([0-9]{1,3}(?:,[0-9]{3})*) → カンマ区切りの数字
// (\n) → 改行
// (\s+) → 空白文字（改行以外）
// ([^¥円0-9\s\n]+) → その他
const DEFAULT_PATTERN =
  /([¥￥])|(円)|([0-9]+(?:,[0-9]{3})*)|(\n)|(\s+)|([^¥円0-9\s\n]+)/g;

// 計算式モードで演算子として扱う記号
// 長音記号「ー」は「コーヒー」等を壊すため絶対に含めないこと
const OPERATOR_CHARS = "+\\-＋－−*＊×✕✖/／÷";

// 計算式モードの正規表現パターン
// 通常モードとの違いは4点
// 1. 数値に小数部を許可する（1.1 を1トークンにする）
// 2. 演算子・半角括弧を独立したトークンにする
// 3. その他（catch-all）の除外文字に新記号と全角￥を加える
// 4. 空白を [^\S\n]+ にして、空白のあとの改行をLFとして取りこぼさない
// 全角括弧（）は「¥1000（昼ごはん）」のような注釈で使われるため、
// 括弧としては扱わず「その他」のままにする
const ARITHMETIC_PATTERN = new RegExp(
  "([¥￥])|(円)|([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)|" +
    `([${OPERATOR_CHARS}])|(\\()|(\\))|(\\n)|([^\\S\\n]+)|` +
    `([^¥￥円0-9\\s${OPERATOR_CHARS}()]+)`,
  "g",
);

const DEFAULT_TYPES: Input["contentType"][] = [
  "YenMark",
  "Yen",
  "number",
  "LF",
  "space",
  "other",
];

const ARITHMETIC_TYPES: Input["contentType"][] = [
  "YenMark",
  "Yen",
  "number",
  "operator",
  "LParen",
  "RParen",
  "LF",
  "space",
  "other",
];

function scan(
  inputText: string,
  pattern: RegExp,
  types: Input["contentType"][],
): Input[] {
  const result: Input[] = [];
  pattern.lastIndex = 0;

  let match = pattern.exec(inputText);
  while (match !== null) {
    for (let group = 0; group < types.length; group++) {
      const content = match[group + 1];
      if (content !== undefined) {
        // 「円」は表記ゆれがないため、従来どおりリテラルに正規化する
        const contentType = types[group];
        result.push({
          content: contentType === "Yen" ? "円" : content,
          contentType,
        });
        break;
      }
    }
    match = pattern.exec(inputText);
  }

  return result;
}

// 行頭の「- 」「* 」「+ 」は箇条書きの記号とみなし、演算子から降格させる。
// 空白が続かない「-100円」は負数としてそのまま演算子に残す。
function demoteBulletMarkers(tokens: Input[]): Input[] {
  let atLineStart = true;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.contentType === "LF") {
      atLineStart = true;
      continue;
    }
    if (token.contentType === "space") {
      continue;
    }

    if (atLineStart && token.contentType === "operator") {
      const next = tokens[index + 1];
      if (
        next === undefined ||
        next.contentType === "space" ||
        next.contentType === "LF"
      ) {
        tokens[index] = { content: token.content, contentType: "other" };
      }
    }

    atLineStart = false;
  }

  return tokens;
}

function tokenize(inputText: string, arithmeticMode = false): Input[] {
  if (!arithmeticMode) {
    return scan(inputText, DEFAULT_PATTERN, DEFAULT_TYPES);
  }

  return demoteBulletMarkers(
    scan(inputText, ARITHMETIC_PATTERN, ARITHMETIC_TYPES),
  );
}

export { tokenize };
