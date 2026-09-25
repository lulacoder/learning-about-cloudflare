import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../auth-form";

export const Route = createFileRoute("/signup/")({
  component: () => <AuthForm mode="signup" />,
});
