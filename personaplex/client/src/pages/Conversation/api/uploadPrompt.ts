export async function uploadTextPrompt(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const response = await fetch(`${window.location.origin}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: trimmed }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload prompt (${response.status})`);
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Prompt upload response missing id");
  }

  return data.id;
}
