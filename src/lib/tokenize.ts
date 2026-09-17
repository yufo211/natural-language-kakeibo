import type { Input } from "../types";

type ContentType = Input["contentType"];
type Rule = [ContentType, string];

interface Scanner {
  pattern: RegExp;
  types: ContentType[];
}

// 長音記号「ー」は「コーヒー」のような語を割ってしまうため演算子に含めない
const OPERATOR_CHARS = "+\\-＋－−*＊×✕✖/／÷";

const DEFAULT_RULES: Rule[] = [
  ["YenMark", "[¥￥]"],
  ["Yen", "円"],
  ["number", "[0-9]+(?:,[0-9]{3})*"],
  ["LF", "\\n"],
  ["space", "\\s+"],
  ["other", "[^¥円0-9\\s\\n]+"],
];

// 全角括弧（）は「¥1000（昼ごはん）」のような注釈で使われるため、括弧として扱わない。
// 空白を [^\S\n]+ にしているのは、計算式モードでは改行が式の区切りになるので
// 「100 \n200円」の改行を空白に飲ませてはいけないため。
const ARITHMETIC_RULES: Rule[] = [
  ["YenMark", "[¥￥]"],
  ["Yen", "円"],
  ["number", "[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?"],
  ["operator", `[${OPERATOR_CHARS}]`],
  ["LParen", "\\("],
  ["RParen", "\\)"],
  ["LF", "\\n"],
  ["space", "[^\\S\\n]+"],
  ["other", `[^¥￥円0-9\\s${OPERATOR_CHARS}()]+`],
];

// パターンと種別を1つの表から作ることで、キャプチャグループの順番と種別がずれないようにする
function createScanner(rules: Rule[]): Scanner {
  return {
    pattern: new RegExp(
      rules.map(([, source]) => `(${source})`).join("|"),
      "g",
    ),
    types: rules.map(([contentType]) => contentType),
  };
}

const DEFAULT_SCANNER = createScanner(DEFAULT_RULES);
const ARITHMETIC_SCANNER = createScanner(ARITHMETIC_RULES);

function scan(inputText: string, { pattern, types }: Scanner): Input[] {
  const result: Input[] = [];
  pattern.lastIndex = 0;

  let match = pattern.exec(inputText);
  while (match !== null) {
    for (let group = 0; group < types.length; group++) {
      const content = match[group + 1];
      if (content !== undefined) {
        const contentType = types[group];
        // 「円」は表記ゆれが無いので、後段が content を見比べずに済むよう正規化する
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

// 「- 100円」は箇条書き、「-100円」は負数。空白が続くかどうかで区別する。
function demoteBulletMarkers(tokens: Input[]): Input[] {
  let atLineStart = true;

  for (const [index, token] of tokens.entries()) {
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
    return scan(inputText, DEFAULT_SCANNER);
  }

  return demoteBulletMarkers(scan(inputText, ARITHMETIC_SCANNER));
}

export { tokenize };
