-- People blocks
CREATE TABLE IF NOT EXISTS public.people_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.people_blocks TO authenticated;
GRANT ALL ON public.people_blocks TO service_role;
ALTER TABLE public.people_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks read" ON public.people_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY "own blocks add" ON public.people_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "own blocks remove" ON public.people_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- True when the caller may post in the thread (member, and no block in a direct chat).
CREATE OR REPLACE FUNCTION public.can_send_people(_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_people_member(_thread) AND NOT EXISTS (
    SELECT 1 FROM public.people_threads t
    JOIN public.people_thread_members m ON m.thread_id = t.id AND m.user_id <> auth.uid()
    JOIN public.people_blocks b ON (b.blocker_id = auth.uid() AND b.blocked_id = m.user_id) OR (b.blocker_id = m.user_id AND b.blocked_id = auth.uid())
    WHERE t.id = _thread AND t.kind = 'direct')
$$;
REVOKE EXECUTE ON FUNCTION public.can_send_people(uuid) FROM anon;

DROP POLICY IF EXISTS "members send as self" ON public.people_messages;
CREATE POLICY "members send as self" ON public.people_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND bot_id IS NULL AND public.can_send_people(thread_id) AND length(content) BETWEEN 1 AND 8000);

-- Delete a whole conversation for everyone in it (direct chats: either person; groups: creator).
CREATE OR REPLACE FUNCTION public.delete_people_thread_for_all(p_thread uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.people_threads;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO t FROM public.people_threads WHERE id = p_thread;
  IF t.id IS NULL OR NOT public.is_people_member(p_thread) THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF t.kind <> 'direct' AND t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Only the group creator can delete it for everyone'; END IF;
  DELETE FROM public.people_messages WHERE thread_id = p_thread;
  DELETE FROM public.people_thread_bots WHERE thread_id = p_thread;
  DELETE FROM public.people_thread_members WHERE thread_id = p_thread;
  DELETE FROM public.people_threads WHERE id = p_thread;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_people_thread_for_all(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_people_thread_for_all(uuid) TO authenticated;

-- Per-bot library
ALTER TABLE public.agent_documents ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.agent_artifacts ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agent_documents_user_bot_idx ON public.agent_documents(user_id, bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_artifacts_user_bot_idx ON public.agent_artifacts(user_id, bot_id, created_at DESC);

-- Vault entries the user's bots may read (no passwords, card numbers or security codes).
CREATE TABLE IF NOT EXISTS public.vault_items (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('login','card','contact')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 300),
  holder text CHECK (length(holder) <= 100),
  expiry text CHECK (expiry ~ '^(0[1-9]|1[0-2])/[0-9]{2}$'),
  ai_usage text CHECK (length(ai_usage) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'card' OR detail ~ '^[0-9]{4}$')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_items TO authenticated;
GRANT ALL ON public.vault_items TO service_role;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vault items" ON public.vault_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS vault_items_user_idx ON public.vault_items(user_id, created_at DESC);