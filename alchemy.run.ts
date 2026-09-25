import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Config from "effect/Config";

export const worker = Cloudflare.Worker("ChatWorker", {
  main: "./src/worker.ts",
  compatibility: { flags: ["nodejs_compat"] },
  assets: {
    directory: "./web/dist",
    notFoundHandling: "single-page-application",
    runWorkerFirst: ["/api/*", "/health"],
  },
  env: {
    CHATS: Cloudflare.DurableObject<import("./src/chat-store.ts").ChatStore>(
      "ChatStore",
    ),
    AI: Cloudflare.Workers.AI(),
    AUTH_DB: Cloudflare.D1.Database("AuthDb", {
      migrations: "./migrations/auth",
    }),
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Config.String("BETTER_AUTH_URL"),
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
