-- Run this in your Supabase SQL Editor.
-- 1) Add image attachment column to chat messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2) Re-apply chat delete policies (in case 0004 was not run)
DROP POLICY IF EXISTS thread_delete_admin ON public.chat_threads;
CREATE POLICY thread_delete_admin ON public.chat_threads
  FOR DELETE USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );

DROP POLICY IF EXISTS msg_delete_admin ON public.chat_messages;
CREATE POLICY msg_delete_admin ON public.chat_messages
  FOR DELETE USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );

-- 3) Storage policies for chat-images bucket (public read, authenticated write)
DROP POLICY IF EXISTS "chat_images_read" ON storage.objects;
CREATE POLICY "chat_images_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_insert" ON storage.objects;
CREATE POLICY "chat_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_delete" ON storage.objects;
CREATE POLICY "chat_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND owner = auth.uid());