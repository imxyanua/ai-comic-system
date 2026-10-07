export const DEFAULT_NEGATIVE_PROMPT = "low quality, blurry, watermark";

export type CharacterPrompt = {
  name: string;
  description: string;
};

export function buildImagePrompt(input: {
  existingPrompt: string | null;
  styleGuide: string | null;
  characters: CharacterPrompt[];
  sceneSummary: string | null;
}): string | null {
  const existing = input.existingPrompt?.trim() ?? "";
  if (existing) {
    return existing;
  }

  const parts: string[] = [];
  const style = input.styleGuide?.trim() ?? "";
  if (style) {
    parts.push(style);
  }
  for (const character of input.characters) {
    const name = character.name.trim();
    const description = character.description.trim();
    if (name && description) {
      parts.push(`${name}: ${description}`);
    } else if (description) {
      parts.push(description);
    } else if (name) {
      parts.push(name);
    }
  }
  const summary = input.sceneSummary?.trim() ?? "";
  if (summary) {
    parts.push(summary);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

export function resolveNegativePrompt(existing: string | null): string {
  const value = existing?.trim() ?? "";
  return value || DEFAULT_NEGATIVE_PROMPT;
}
