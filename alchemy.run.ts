import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "AlchemyEffectDurable",
  {
    providers: Cloudflare.providers(),
    state: State.localState(),
  },
  Effect.succeed({}),
);
