import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createChat, type Chat } from "./api";
import { useAuth } from "./auth";

export function useCreateChat() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (title: string) => createChat(token, title),
    onSuccess: (chat) => {
      queryClient.setQueryData<Chat[]>(["chats"], (current = []) => [chat, ...current]);
      void navigate({ to: "/chat/$chatId", params: { chatId: chat.id } });
    },
  });
}
