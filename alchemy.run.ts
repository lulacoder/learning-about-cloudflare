import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

export const worker = Cloudflare.Worker("ChatWorker", {
  main: "./src/worker.ts",
  env: {
    CHATS: Cloudflare.DurableObject<import("./src/worker.ts").ChatStore>(
      "ChatStore",
    ),
  },
  dev: { port: 8787 },
});

export type WorkerEnv = Cloudflare.InferEnv<typeof worker>;

export default Alchemy.Stack(
  "AlchemyEffectDurable",
  {
    providers: Cloudflare.providers(),
    state: State.localState(),
  },
  Effect.gen(function* () {
    const chatWorker = yield* worker;
    return { url: chatWorker.url };
  }),
);
