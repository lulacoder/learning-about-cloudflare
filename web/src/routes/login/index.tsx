import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../auth-form";

export const Route = createFileRoute("/login/")({
  component: () => <AuthForm mode="login" />,
});
