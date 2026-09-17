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
  // トークン配列における「計算に使われたトークン」のインデックス集合
  includedIndices: Set<number>;
}

export type { EvaluationResult, Input };
