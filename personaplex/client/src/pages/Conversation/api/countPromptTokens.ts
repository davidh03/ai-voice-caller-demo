export const SUGGESTED_MAX_PROMPT_TOKENS = 2048;

export type PromptTokenCount = {
  tokens: number;
  chars: number;
  estimated?: boolean;
};

export function estimatePromptTokens(text: string): PromptTokenCount {
  const trimmed = text.trim();
  if (!trimmed) {
    return { tokens: 0, chars: 0, estimated: true };
  }
  // Rough estimate including <system> wrapper overhead (~4 chars per token).
  const wrappedChars = trimmed.length + 20;
  return {
    tokens: Math.max(1, Math.ceil(wrappedChars / 4)),
    chars: trimmed.length,
    estimated: true,
  };
}

export async function countPromptTokens(
  text: string,
  signal?: AbortSignal,
): Promise<PromptTokenCount> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { tokens: 0, chars: 0 };
  }

  try {
    const response = await fetch(`${window.location.origin}/api/prompt/count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
      signal,
    });

    if (!response.ok) {
      return estimatePromptTokens(trimmed);
    }

    const data = (await response.json()) as PromptTokenCount;
    return {
      tokens: data.tokens ?? 0,
      chars: data.chars ?? trimmed.length,
      estimated: false,
    };
  } catch {
    return estimatePromptTokens(trimmed);
  }
}
