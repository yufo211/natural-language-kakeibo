import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import Header from "@/components/header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Footer from "./components/footer";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import {
  calculateTotal,
  isTokenIncludedInCalculation,
  isYenIncludedInCalculation,
  isYenMarkIncludedInCalculation,
} from "./lib/calculate";
import { evaluateTokens } from "./lib/expression";
import { tokenize } from "./lib/tokenize";
import type { Input } from "./types";

const INCLUDED_CLASS =
  "bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100"; // 計算対象
const EXCLUDED_CLASS =
  "bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100";
const MUTED_CLASS = "bg-muted text-muted-foreground";

function App() {
  const [userInput, setUserInput] = useState<string>("");
  const [filterInput, setFilterInput] = useState<Input[]>([]);

  const [onlyAfterYenMark, setOnlyAfterYenMark] = useState<boolean>(false);
  const [onlyBeforeYen, setOnlyBeforeYen] = useState<boolean>(false);
  const [arithmeticMode, setArithmeticMode] = useState<boolean>(false);

  const [includedIndices, setIncludedIndices] = useState<Set<number>>(
    new Set(),
  );
  const [calculateResult, setCalculateResult] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleClear = () =>
    window.confirm("入力された内容がクリアされます。よろしいですか？") &&
    setUserInput("");

  // 計算式モードと「¥」「円」による絞り込みは考え方が逆なので併用できない。
  // どちらかをオンにすると、もう片方は自動でオフになる。
  const handleArithmeticModeChange = (checked: boolean) => {
    setArithmeticMode(checked);
    if (checked) {
      setOnlyAfterYenMark(false);
      setOnlyBeforeYen(false);
    }
  };

  const handleOnlyAfterYenMarkChange = (checked: boolean) => {
    setOnlyAfterYenMark(checked);
    if (checked) setArithmeticMode(false);
  };

  const handleOnlyBeforeYenChange = (checked: boolean) => {
    setOnlyBeforeYen(checked);
    if (checked) setArithmeticMode(false);
  };

  useEffect(() => {
    if (userInput.trim() === "") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  });

  useEffect(() => {
    if (userInput.trim() === "") {
      setFilterInput([]);
      setIncludedIndices(new Set());
      setCalculateResult("");
      return;
    }

    const t = tokenize(userInput, arithmeticMode);
    setFilterInput(t);

    if (arithmeticMode) {
      const { total, includedIndices } = evaluateTokens(t);
      setIncludedIndices(includedIndices);
      setCalculateResult(total.toLocaleString());
    } else {
      setIncludedIndices(new Set());
      const total = calculateTotal(onlyAfterYenMark, onlyBeforeYen, t);
      setCalculateResult(total.toLocaleString());
    }
  }, [userInput, onlyAfterYenMark, onlyBeforeYen, arithmeticMode]);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(calculateResult);
    setIsCopied(true);

    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  return (
    <>
      <Header />
      <div className="mx-auto flex min-h-svh flex-col items-center px-4 md:w-3xl">
        <div className="my-12 flex w-full flex-col">
          <Alert variant="default">
            <Info />
            <AlertTitle className="font-semibold">
              このツールについて
            </AlertTitle>

            <AlertDescription className="my-2">
              数字だけを抜き出してその合計を計算します。
              <strong>
                処理はすべてデバイス内で実行されるため、入力した情報がインターネットに送信されることはありません。
              </strong>
            </AlertDescription>
          </Alert>
        </div>

        <Label
          htmlFor="user_input"
          className="mb-2 items-start self-start font-semibold"
        >
          計算したい内容を入力してください
        </Label>
        <Textarea
          id="user_input"
          className="h-48 resize-y"
          placeholder="ここに内容を貼り付けてください。（例：¥2,000 映画代）"
          onChange={(e) => setUserInput(e.target.value)}
          value={userInput}
        />

        <div className="my-4 flex flex-col">
          <div className="my-2 flex items-center space-x-2">
            <Switch
              id="only_after_yen_mark"
              checked={onlyAfterYenMark}
              onCheckedChange={handleOnlyAfterYenMarkChange}
            />
            <Label htmlFor="only_after_yen_mark">
              前に「¥」がついている数字だけを計算に含める
            </Label>
          </div>
          <div className="my-2 flex items-center space-x-2">
            <Switch
              id="only_before_yen"
              checked={onlyBeforeYen}
              onCheckedChange={handleOnlyBeforeYenChange}
            />
            <Label htmlFor="only_before_yen">
              後ろに「円」がついている数字だけを計算に含める
            </Label>
          </div>
          <div className="my-2 flex items-center space-x-2">
            <Switch
              id="arithmetic_mode"
              checked={arithmeticMode}
              onCheckedChange={handleArithmeticModeChange}
            />
            <Label htmlFor="arithmetic_mode">
              計算式（＋ − × ÷ と括弧）を解釈して計算する
            </Label>
          </div>
          <p className="ml-1 text-muted-foreground text-sm">
            計算式モードをオンにすると、上の2つの設定はオフになります。括弧は半角の
            ( ) をお使いください。
          </p>
        </div>

        <div className="w-full max-w-3xl">
          <Label className="mb-2 font-semibold">解析結果</Label>
          <div className="mb-4 min-h-12 whitespace-pre-wrap rounded-md border bg-accent p-4 font-mono text-sm leading-relaxed">
            {filterInput.map((token, index) => {
              if (token.contentType === "LF") {
                return "\n";
              }

              let className = "";
              if (arithmeticMode) {
                // 計算式モードでは「¥」「円」による絞り込みを使わないので、
                // 式に採用されたトークンかどうかだけで色を決める
                if (token.contentType === "space") {
                  className = "";
                } else if (
                  token.contentType === "number" ||
                  token.contentType === "operator" ||
                  token.contentType === "LParen" ||
                  token.contentType === "RParen"
                ) {
                  className = includedIndices.has(index)
                    ? INCLUDED_CLASS
                    : MUTED_CLASS;
                } else {
                  className = EXCLUDED_CLASS;
                }
              } else if (token.contentType === "number") {
                const isIncluded = isTokenIncludedInCalculation(
                  token,
                  index,
                  filterInput,
                  onlyAfterYenMark,
                  onlyBeforeYen,
                );
                className = isIncluded ? INCLUDED_CLASS : MUTED_CLASS;
              } else if (token.contentType === "space") {
                className = "";
              } else if (token.contentType === "YenMark") {
                const isIncluded = isYenMarkIncludedInCalculation(
                  index,
                  filterInput,
                  onlyAfterYenMark,
                  onlyBeforeYen,
                );
                className = isIncluded ? INCLUDED_CLASS : EXCLUDED_CLASS;
              } else if (token.contentType === "Yen") {
                const isIncluded = isYenIncludedInCalculation(
                  index,
                  filterInput,
                  onlyAfterYenMark,
                  onlyBeforeYen,
                );
                className = isIncluded ? INCLUDED_CLASS : EXCLUDED_CLASS;
              } else {
                className = EXCLUDED_CLASS;
              }

              return (
                <span key={index} className={className}>
                  {token.content}
                </span>
              );
            })}
          </div>

          <div className="rounded-md border bg-secondary p-4">
            <span className="font-semibold text-accent-foreground text-lg">
              合計: ¥{calculateResult}
            </span>
          </div>
        </div>
        <div className="m-8 flex flex-row gap-4">
          <Button variant="outline" onClick={handleClear}>
            入力内容をクリア
          </Button>
          <Button
            onClick={copyToClipboard}
            disabled={!calculateResult || isCopied}
          >
            {isCopied ? "コピーしました！" : "結果をコピーする"}
          </Button>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default App;
