type ChatTurn = { role: "user" | "assistant"; content: string };

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const MAX_CONTEXT_CHARS = 12_000;

export async function generateReply(ai: Ai, history: ChatTurn[]): Promise<string> {
  const recent: ChatTurn[] = [];
  let length = 0;

  for (let index = history.length - 1; index >= 0; index--) {
    const turn = history[index];
    if (length + turn.content.length > MAX_CONTEXT_CHARS) break;
    recent.unshift(turn);
    length += turn.content.length;
  }

  const result = await ai.run(MODEL, {
    messages: [
      { role: "system", content: "You are a helpful assistant. Keep replies clear and concise." },
      ...recent,
    ],
    max_tokens: 512,
  });

  if (
    typeof result !== "object" ||
    result === null ||
    !("response" in result) ||
    typeof result.response !== "string" ||
    !result.response.trim()
  ) {
    throw new Error("Workers AI returned no text");
  }
  return result.response.trim();
}
