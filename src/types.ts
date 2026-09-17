type ContentType =
  | "number"
  | "Yen"
  | "YenMark"
  | "LF"
  | "space"
  | "operator"
  | "LParen"
  | "RParen"
  | "other";

interface Input {
  content: string;
  contentType: ContentType;
}

interface EvaluationResult {
  total: number;
  // 元のトークン配列に対するインデックス
  includedIndices: Set<number>;
}

export type { EvaluationResult, Input };
