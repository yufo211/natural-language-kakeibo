import { expect, test } from "vitest";
import { evaluateTokens } from "../../src/lib/expression";
import { tokenize } from "../../src/lib/tokenize";
import type { Input } from "../../src/types";

const total = (text: string): number =>
  evaluateTokens(tokenize(text, true)).total;

test("evaluateTokens: パターン1 - 単価×個数（100円 * 3個）", () => {
  expect(total("100円 * 3個")).toBe(300);
});

test("evaluateTokens: パターン2 - 全角の乗算記号（× ✕ ✖）", () => {
  expect(total("100円 × 3本")).toBe(300);
  expect(total("100円 ✕ 3本")).toBe(300);
  expect(total("100円 ✖ 3本")).toBe(300);
});

test("evaluateTokens: パターン3 - 個数が先（3個 × 100円）", () => {
  expect(total("3個 × 100円")).toBe(300);
});

test("evaluateTokens: パターン4 - 括弧（(100 + 50)円 * 3個）", () => {
  expect(total("(100 + 50)円 * 3個")).toBe(450);
});

test("evaluateTokens: パターン5 - 括弧と小数（(100 * 1.1 + 30)円 * 2個）", () => {
  expect(total("(100 * 1.1 + 30)円 * 2個")).toBe(280);
});

test("evaluateTokens: 小数はそのまま合計する", () => {
  expect(total("99円 * 1.1")).toBe(108.9);
});

test("evaluateTokens: 浮動小数点の誤差を丸める", () => {
  expect(total("100円 * 1.1")).toBe(110);
  expect(total("0.1 + 0.2")).toBe(0.3);
});

test("evaluateTokens: 演算子の優先順位（* / が + - より強い）", () => {
  expect(total("100 + 2 * 3")).toBe(106);
  expect(total("(100 + 2) * 3")).toBe(306);
});

test("evaluateTokens: 減算（1000円 - 200円）", () => {
  expect(total("1000円 - 200円")).toBe(800);
});

test("evaluateTokens: 除算（3000円 / 4人）", () => {
  expect(total("3000円 / 4人")).toBe(750);
  expect(total("3000円 ÷ 4人")).toBe(750);
});

test("evaluateTokens: 単項マイナス", () => {
  expect(total("-100円")).toBe(-100);
  expect(total("2 * -3")).toBe(-6);
});

test("evaluateTokens: 演算子がない数字はそれぞれ別の式として加算する", () => {
  expect(total("100円 コーヒー 200円 パン")).toBe(300);
});

test("evaluateTokens: ¥と円が混ざっていても演算子がまたげる", () => {
  expect(total("合計: 1,000円 +¥500")).toBe(1500);
});

test("evaluateTokens: 箇条書きのハイフンは減算にしない", () => {
  expect(total("- 100円\n- 200円")).toBe(300);
});

test("evaluateTokens: 改行をまたいで式は続かない", () => {
  expect(total("100 *\n3")).toBe(103);
  expect(total("100円\n200円 × 2個")).toBe(500);
});

test("evaluateTokens: 壊れた式 - 末尾の演算子は捨てる", () => {
  expect(total("100円 *")).toBe(100);
  expect(total("100 - - 50")).toBe(150); // 単項マイナスとして解釈される
});

test("evaluateTokens: 壊れた式 - 閉じ括弧がなければ行末で閉じる", () => {
  expect(total("(100 + 50")).toBe(150);
  expect(total("(100 + 50円 * 3")).toBe(250);
});

test("evaluateTokens: 壊れた式 - 余分な閉じ括弧は無視する", () => {
  expect(total("100 + )")).toBe(100);
  expect(total(")")).toBe(0);
});

test("evaluateTokens: 壊れた式 - 空の括弧", () => {
  expect(total("()")).toBe(0);
  expect(total("100 * ()")).toBe(100);
});

test("evaluateTokens: ゼロ除算は演算子を捨てて左辺を残す", () => {
  expect(total("3000円 / 0人")).toBe(3000);
});

test("evaluateTokens: 数字がない場合と空の配列", () => {
  expect(total("映画代")).toBe(0);
  expect(evaluateTokens([]).total).toBe(0);
  expect(evaluateTokens([])).toStrictEqual({
    total: 0,
    includedIndices: new Set(),
  });
});

test("evaluateTokens: 計算に使われたトークンのインデックスを返す", () => {
  // 100(0) 円(1) 空白(2) *(3) 空白(4) 3(5) 個(6)
  const tokens: Input[] = tokenize("100円 * 3個", true);
  expect(evaluateTokens(tokens).includedIndices).toStrictEqual(
    new Set([0, 3, 5]),
  );
});

test("evaluateTokens: 捨てられた演算子はインデックスに含めない", () => {
  // 100(0) 円(1) 空白(2) *(3)
  const tokens: Input[] = tokenize("100円 *", true);
  expect(evaluateTokens(tokens).includedIndices).toStrictEqual(new Set([0]));
});

test("evaluateTokens: 括弧も計算に使われればインデックスに含む", () => {
  // ((0) 100(1) +(2) 50(3) )(4)
  const tokens: Input[] = tokenize("(100+50)", true);
  expect(evaluateTokens(tokens).includedIndices).toStrictEqual(
    new Set([0, 1, 2, 3, 4]),
  );
});

test("evaluateTokens: 記号の羅列でスタックを溢れさせない", () => {
  expect(total(`1 ${"-".repeat(50000)} 2`)).toBe(3);
  expect(total(`${"(".repeat(50000)}1${")".repeat(50000)}`)).toBe(1);
});

test("evaluateTokens: 1兆円台の整数を丸めない", () => {
  expect(total("1,234,567,890,123円")).toBe(1234567890123);
  expect(total("12,345,678,901,234円 + 1円")).toBe(12345678901235);
});

test("evaluateTokens: 捨てた演算の右オペランドは計算対象にしない", () => {
  // 3000(0) 円(1) 空白(2) /(3) 空白(4) 0(5) 人(6)
  const tokens = tokenize("3000円 / 0人", true);
  expect(evaluateTokens(tokens)).toStrictEqual({
    total: 3000,
    includedIndices: new Set([0]),
  });
});

test("evaluateTokens: ゼロ除算のあとも同じ式の評価を続ける", () => {
  expect(total("3000円 / 0人 + 500円")).toBe(3500);
});
