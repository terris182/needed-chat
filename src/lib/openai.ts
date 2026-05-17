import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Circuit breaker state (§19.3 — $50 staging, $500 prod)
let consecutiveFailures = 0;
const MAX_FAILURES = 5;
let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_RESET_MS = 60_000; // 1 min

export async function withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  if (circuitOpen) {
    if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
      circuitOpen = false;
      consecutiveFailures = 0;
    } else {
      throw new Error("OpenAI circuit breaker is open — too many recent failures");
    }
  }

  try {
    const result = await fn();
    consecutiveFailures = 0;
    return result;
  } catch (error) {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_FAILURES) {
      circuitOpen = true;
      circuitOpenedAt = Date.now();
    }
    throw error;
  }
}

export async function embed(text: string): Promise<number[]> {
  return withCircuitBreaker(async () => {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0].embedding;
  });
}
