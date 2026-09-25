import { betterAuth } from "better-auth";
import type { WorkerEnv } from "../alchemy.run.ts";

export function createAuth(env: WorkerEnv) {
  return betterAuth({
    database: env.AUTH_DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: { useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:" },
    emailAndPassword: { enabled: true },
  });
}
