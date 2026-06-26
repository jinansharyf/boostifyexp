-- Allow admins (and partners with manage_chat) to delete chat threads.
-- Messages cascade-delete via chat_messages.thread_id FK ON DELETE CASCADE.

DROP POLICY IF EXISTS thread_delete_admin ON public.chat_threads;
CREATE POLICY thread_delete_admin ON public.chat_threads
  FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );

-- Optional: allow admins to delete individual messages too.
DROP POLICY IF EXISTS msg_delete_admin ON public.chat_messages;
CREATE POLICY msg_delete_admin ON public.chat_messages
  FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );