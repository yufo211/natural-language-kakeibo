import { expect, test } from "vitest";
import { tokenize } from "../../src/lib/tokenize";

test("Tokenize #1", () => {
  expect(tokenize("100円")).toStrictEqual([
    {
      content: "100",
      contentType: "number",
    },
    {
      content: "円",
      contentType: "Yen",
    },
  ]);
});

test("Tokenize #2", () => {
  expect(tokenize("1,000円")).toStrictEqual([
    {
      content: "1,000",
      contentType: "number",
    },
    {
      content: "円",
      contentType: "Yen",
    },
  ]);
});

test("Tokenize #3.1: 半角円マーク", () => {
  expect(tokenize("¥500")).toStrictEqual([
    { content: "¥", contentType: "YenMark" },
    { content: "500", contentType: "number" },
  ]);
});

test("Tokenize #3.2: 全角円マーク", () => {
  expect(tokenize("￥500")).toStrictEqual([
    { content: "￥", contentType: "YenMark" },
    { content: "500", contentType: "number" },
  ]);
});

test("Tokenize #4: 改行", () => {
  expect(tokenize("100円\n200円")).toStrictEqual([
    { content: "100", contentType: "number" },
    { content: "円", contentType: "Yen" },
    { content: "\n", contentType: "LF" },
    { content: "200", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #5: 空白文字", () => {
  expect(tokenize("100 円")).toStrictEqual([
    { content: "100", contentType: "number" },
    { content: " ", contentType: "space" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #6: タブや複数空白", () => {
  expect(tokenize("100\t円  200円")).toStrictEqual([
    { content: "100", contentType: "number" },
    { content: "\t", contentType: "space" },
    { content: "円", contentType: "Yen" },
    { content: "  ", contentType: "space" },
    { content: "200", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #7: お母さんケース", () => {
  expect(tokenize("¥1000（昼ごはん）")).toStrictEqual([
    { content: "¥", contentType: "YenMark" },
    { content: "1000", contentType: "number" },
    { content: "（昼ごはん）", contentType: "other" },
  ]);
});

test("Tokenize #8: 複雑な混合", () => {
  expect(tokenize("合計: 1,000円 +¥500")).toStrictEqual([
    { content: "合計:", contentType: "other" },
    { content: " ", contentType: "space" },
    { content: "1,000", contentType: "number" },
    { content: "円", contentType: "Yen" },
    { content: " ", contentType: "space" },
    { content: "+", contentType: "other" },
    { content: "¥", contentType: "YenMark" },
    { content: "500", contentType: "number" },
  ]);
});

test("Tokenize #9: 空文字", () => {
  expect(tokenize("")).toStrictEqual([]);
});

test("Tokenize #10: 計算式モード - 乗算記号（* × ✕ ✖）", () => {
  for (const mark of ["*", "×", "✕", "✖"]) {
    expect(tokenize(`100円${mark}3個`, true)).toStrictEqual([
      { content: "100", contentType: "number" },
      { content: "円", contentType: "Yen" },
      { content: mark, contentType: "operator" },
      { content: "3", contentType: "number" },
      { content: "個", contentType: "other" },
    ]);
  }
});

test("Tokenize #11: 計算式モード - 除算記号（/ ÷ ／）", () => {
  for (const mark of ["/", "÷", "／"]) {
    expect(tokenize(`3000円${mark}4人`, true)).toStrictEqual([
      { content: "3000", contentType: "number" },
      { content: "円", contentType: "Yen" },
      { content: mark, contentType: "operator" },
      { content: "4", contentType: "number" },
      { content: "人", contentType: "other" },
    ]);
  }
});

test("Tokenize #12: 計算式モード - 半角括弧", () => {
  expect(tokenize("(100 + 50)円", true)).toStrictEqual([
    { content: "(", contentType: "LParen" },
    { content: "100", contentType: "number" },
    { content: " ", contentType: "space" },
    { content: "+", contentType: "operator" },
    { content: " ", contentType: "space" },
    { content: "50", contentType: "number" },
    { content: ")", contentType: "RParen" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #13: 計算式モード - 小数", () => {
  expect(tokenize("1.1", true)).toStrictEqual([
    { content: "1.1", contentType: "number" },
  ]);
  expect(tokenize("1,234.5円", true)).toStrictEqual([
    { content: "1,234.5", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #14: 計算式モード - 単位を挟んでも演算子は独立する", () => {
  expect(tokenize("3個×100円", true)).toStrictEqual([
    { content: "3", contentType: "number" },
    { content: "個", contentType: "other" },
    { content: "×", contentType: "operator" },
    { content: "100", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #15: 計算式モード - 長音記号は演算子にしない", () => {
  expect(tokenize("コーヒー850円", true)).toStrictEqual([
    { content: "コーヒー", contentType: "other" },
    { content: "850", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #16: 計算式モード - 行頭の箇条書き記号は演算子にしない", () => {
  expect(tokenize("- 100円\n- 200円", true)).toStrictEqual([
    { content: "-", contentType: "other" },
    { content: " ", contentType: "space" },
    { content: "100", contentType: "number" },
    { content: "円", contentType: "Yen" },
    { content: "\n", contentType: "LF" },
    { content: "-", contentType: "other" },
    { content: " ", contentType: "space" },
    { content: "200", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
  expect(tokenize("* 100円", true)[0]).toStrictEqual({
    content: "*",
    contentType: "other",
  });
  expect(tokenize("+ 100円", true)[0]).toStrictEqual({
    content: "+",
    contentType: "other",
  });
});

test("Tokenize #17: 計算式モード - 空白が続かない行頭の符号は演算子のまま", () => {
  expect(tokenize("-100円", true)).toStrictEqual([
    { content: "-", contentType: "operator" },
    { content: "100", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #18: 計算式モード - 全角括弧は注釈としてotherのまま", () => {
  expect(tokenize("¥1000（昼ごはん）", true)).toStrictEqual([
    { content: "¥", contentType: "YenMark" },
    { content: "1000", contentType: "number" },
    { content: "（昼ごはん）", contentType: "other" },
  ]);
});

test("Tokenize #19: 計算式モード - 空白のあとの改行がLFになる", () => {
  expect(tokenize("100 \n200円", true)).toStrictEqual([
    { content: "100", contentType: "number" },
    { content: " ", contentType: "space" },
    { content: "\n", contentType: "LF" },
    { content: "200", contentType: "number" },
    { content: "円", contentType: "Yen" },
  ]);
});

test("Tokenize #20: 計算式モード - 全角￥を認識する", () => {
  expect(tokenize("あ￥500", true)).toStrictEqual([
    { content: "あ", contentType: "other" },
    { content: "￥", contentType: "YenMark" },
    { content: "500", contentType: "number" },
  ]);
});

test("Tokenize #21: 計算式モード - 空文字", () => {
  expect(tokenize("", true)).toStrictEqual([]);
});

test("Tokenize #22: 計算式モードOFFでは従来どおり演算子を認識しない", () => {
  expect(tokenize("100円 * 3個")).toStrictEqual([
    { content: "100", contentType: "number" },
    { content: "円", contentType: "Yen" },
    { content: " ", contentType: "space" },
    { content: "*", contentType: "other" },
    { content: " ", contentType: "space" },
    { content: "3", contentType: "number" },
    { content: "個", contentType: "other" },
  ]);
  expect(tokenize("1.5")).toStrictEqual([
    { content: "1", contentType: "number" },
    { content: ".", contentType: "other" },
    { content: "5", contentType: "number" },
  ]);
});
