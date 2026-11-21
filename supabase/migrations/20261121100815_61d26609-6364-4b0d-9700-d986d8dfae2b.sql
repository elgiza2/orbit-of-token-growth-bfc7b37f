DROP POLICY IF EXISTS "members see co-members read state" ON public.people_thread_members;
CREATE POLICY "members see co-members read state" ON public.people_thread_members FOR SELECT TO authenticated USING (public.is_people_member(thread_id));
CREATE OR REPLACE FUNCTION public.people_read_state(p_thread uuid)
RETURNS TABLE(user_id uuid, last_read_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT m.user_id, m.last_read_at FROM public.people_thread_members m WHERE m.thread_id = p_thread;
$$;