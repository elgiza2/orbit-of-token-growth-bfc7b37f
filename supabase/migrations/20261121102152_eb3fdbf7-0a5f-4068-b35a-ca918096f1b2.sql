ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS group_invites text NOT NULL DEFAULT 'everyone' CHECK (group_invites IN ('everyone','contacts','nobody'));

CREATE OR REPLACE FUNCTION public.can_add_to_group(p_adder uuid, p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_adder = p_target OR CASE (SELECT group_invites FROM public.profiles WHERE id = p_target)
    WHEN 'everyone' THEN true
    WHEN 'nobody' THEN false
    ELSE EXISTS (SELECT 1 FROM public.people_thread_members a JOIN public.people_thread_members b ON a.thread_id = b.thread_id
                 JOIN public.people_threads t ON t.id = a.thread_id
                 WHERE t.kind = 'direct' AND a.user_id = p_adder AND b.user_id = p_target)
  END
$$;
REVOKE EXECUTE ON FUNCTION public.can_add_to_group(uuid, uuid) FROM public, anon;

CREATE OR REPLACE FUNCTION public.add_people_member(p_thread uuid, p_username text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid;
BEGIN
  IF NOT public.is_people_member(p_thread) THEN RAISE EXCEPTION 'Not a member'; END IF;
  IF (SELECT kind FROM public.people_threads WHERE id = p_thread) <> 'group' THEN RAISE EXCEPTION 'Only groups can add people'; END IF;
  SELECT id INTO uid FROM public.profiles WHERE username = lower(trim(leading '@' from trim(p_username)));
  IF uid IS NULL THEN RAISE EXCEPTION 'No user with that username'; END IF;
  IF NOT public.can_add_to_group(auth.uid(), uid) THEN RAISE EXCEPTION 'This person does not allow being added to groups'; END IF;
  INSERT INTO public.people_thread_members(thread_id, user_id) VALUES (p_thread, uid) ON CONFLICT DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION public.create_people_group(p_name text, p_usernames text[], p_bot_ids uuid[])
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE me uuid := auth.uid(); t uuid; u text; uid uuid; b uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF length(trim(coalesce(p_name, ''))) = 0 THEN RAISE EXCEPTION 'Group name required'; END IF;
  INSERT INTO public.people_threads(kind, name, created_by) VALUES ('group', left(trim(p_name), 80), me) RETURNING id INTO t;
  INSERT INTO public.people_thread_members(thread_id, user_id, role) VALUES (t, me, 'owner');
  FOREACH u IN ARRAY coalesce(p_usernames, '{}') LOOP
    SELECT id INTO uid FROM public.profiles WHERE username = lower(trim(leading '@' from trim(u)));
    IF uid IS NULL THEN RAISE EXCEPTION 'No user with username %', u; END IF;
    IF NOT public.can_add_to_group(me, uid) THEN RAISE EXCEPTION '@% does not allow being added to groups', u; END IF;
    INSERT INTO public.people_thread_members(thread_id, user_id) VALUES (t, uid) ON CONFLICT DO NOTHING;
  END LOOP;
  FOREACH b IN ARRAY coalesce(p_bot_ids, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.bots WHERE id = b AND owner_id = me) THEN RAISE EXCEPTION 'You can only add your own bots'; END IF;
    INSERT INTO public.people_thread_bots(thread_id, bot_id, added_by) VALUES (t, b, me) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN t;
END $function$;