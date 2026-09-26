type ChatTurn = { role: "user" | "assistant"; content: string };

const MODEL = "@cf/zai-org/glm-4.7-flash";
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
    max_completion_tokens: 512,
  });

  const reply = result.choices[0]?.message.content?.trim();
  if (!reply) {
    throw new Error("Workers AI returned no text");
  }
  return reply;
}
