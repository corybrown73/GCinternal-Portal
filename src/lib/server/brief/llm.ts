import { aiConfigured } from "../ai/config";

/** The brief's model passes live in ./pipeline; this says whether they can run at all. */
export function llmAvailable(): boolean {
  return aiConfigured();
}
