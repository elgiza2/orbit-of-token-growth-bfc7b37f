-- Read receipts and emoji reactions for person-to-person chats.
CREATE OR REPLACE FUNCTION public.people_read_state(p_thread uuid)
RETURNS TABLE(user_id uuid, last_read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.last_read_at FROM public.people_thread_members m
  WHERE m.thread_id = p_thread
    AND EXISTS (SELECT 1 FROM public.people_thread_members me WHERE me.thread_id = p_thread AND me.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.people_read_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.people_read_state(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.people_reactions (
  message_id uuid NOT NULL REFERENCES public.people_messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.people_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_reactions TO authenticated;
CREATE POLICY "members read reactions" ON public.people_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.people_thread_members m WHERE m.thread_id = people_reactions.thread_id AND m.user_id = auth.uid()));
CREATE POLICY "members react as self" ON public.people_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.people_messages pm JOIN public.people_thread_members m ON m.thread_id = pm.thread_id WHERE pm.id = message_id AND pm.thread_id = people_reactions.thread_id AND m.user_id = auth.uid()));
CREATE POLICY "change own reaction" ON public.people_reactions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "remove own reaction" ON public.people_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.people_thread_members REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.people_reactions;
EXCEPTION WHEN others THEN NULL; END $$;
