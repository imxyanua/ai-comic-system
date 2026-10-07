import { createHash } from "crypto";

export function computeIdempotencyKey(input: {
  panelId: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
}): string {
  const canonical = JSON.stringify([
    input.panelId,
    input.prompt,
    input.negativePrompt,
    input.seed,
    input.width,
    input.height,
    input.steps,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
