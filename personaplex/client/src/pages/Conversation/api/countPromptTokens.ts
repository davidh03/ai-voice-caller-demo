export type PromptTokenCount = {
  tokens: number;
  chars: number;
};

export async function countPromptTokens(text: string): Promise<PromptTokenCount> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { tokens: 0, chars: 0 };
  }

  const response = await fetch(`${window.location.origin}/api/prompt/count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: trimmed }),
  });

  if (!response.ok) {
    throw new Error(`Failed to count tokens (${response.status})`);
  }

  const data = (await response.json()) as PromptTokenCount;
  return {
    tokens: data.tokens ?? 0,
    chars: data.chars ?? trimmed.length,
  };
}
