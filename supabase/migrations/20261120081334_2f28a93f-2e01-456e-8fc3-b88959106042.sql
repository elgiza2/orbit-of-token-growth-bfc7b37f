ALTER TABLE public.agent_browser_contexts ADD COLUMN IF NOT EXISTS browser_use_profile_id uuid;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS agentphone_call_id text;
CREATE UNIQUE INDEX IF NOT EXISTS phone_calls_agentphone_id_unique ON public.phone_calls(agentphone_call_id) WHERE agentphone_call_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.reserve_agentphone_call(p_user uuid, p_bot uuid, p_conversation uuid, p_call uuid, p_to text, p_goal text)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('outbound-phone:' || p_user::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.bots WHERE id = p_bot AND owner_id = p_user) OR NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation AND user_id = p_user) THEN RETURN 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_calls WHERE id = p_call AND user_id = p_user) THEN RETURN 'existing'; END IF;
  IF (SELECT count(*) FROM public.phone_calls WHERE user_id = p_user AND direction = 'outbound' AND created_at >= now() - interval '24 hours') >= 10 THEN RETURN 'limit'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_calls WHERE user_id = p_user AND status IN ('dialing','in_progress') AND created_at >= now() - interval '20 minutes') THEN RETURN 'busy'; END IF;
  INSERT INTO public.phone_calls(id,user_id,bot_id,conversation_id,direction,counterpart,purpose,status,agentphone_call_id) VALUES (p_call,p_user,p_bot,p_conversation,'outbound',p_to,p_goal,'dialing','pending:' || p_call::text);
  RETURN 'reserved';
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_agentphone_call(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agentphone_call(uuid,uuid,uuid,uuid,text,text) TO service_role;