ALTER TABLE public.people_threads ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.people_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE public.people_group_invites (thread_id uuid PRIMARY KEY REFERENCES public.people_threads(id) ON DELETE CASCADE, token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.people_group_invites TO authenticated;
GRANT ALL ON public.people_group_invites TO service_role;
ALTER TABLE public.people_group_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creator reads group invite" ON public.people_group_invites FOR SELECT TO authenticated USING (created_by=auth.uid() AND public.is_people_member(thread_id));
CREATE TRIGGER people_invite_updated BEFORE UPDATE ON public.people_group_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.update_people_group(p_thread uuid,p_name text,p_description text,p_avatar text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR NOT public.is_people_member(p_thread) OR NOT EXISTS (SELECT 1 FROM public.people_threads WHERE id=p_thread AND kind='group' AND created_by=auth.uid()) THEN RAISE EXCEPTION 'Only the group creator can edit group information'; END IF;
IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 80 OR length(coalesce(p_description,''))>1000 OR length(coalesce(p_avatar,''))>400000 THEN RAISE EXCEPTION 'Invalid group information'; END IF;
IF p_avatar IS NOT NULL AND p_avatar !~ '^data:image/(jpeg|png|webp);base64,' THEN RAISE EXCEPTION 'Invalid group photo'; END IF;
UPDATE public.people_threads SET name=trim(p_name),description=coalesce(p_description,''),avatar_url=p_avatar,updated_at=now() WHERE id=p_thread;
END $$;
CREATE OR REPLACE FUNCTION public.people_group_invite(p_thread uuid,p_reset boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result uuid; BEGIN
IF auth.uid() IS NULL OR NOT public.is_people_member(p_thread) OR NOT EXISTS (SELECT 1 FROM public.people_threads WHERE id=p_thread AND kind='group' AND created_by=auth.uid()) THEN RAISE EXCEPTION 'Only the group creator can manage invitations'; END IF;
INSERT INTO public.people_group_invites(thread_id,created_by) VALUES (p_thread,auth.uid()) ON CONFLICT(thread_id) DO UPDATE SET token=CASE WHEN p_reset THEN gen_random_uuid() ELSE people_group_invites.token END,updated_at=now() RETURNING token INTO result; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.preview_people_invite(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
SELECT jsonb_build_object('name',t.name,'description',t.description,'avatarUrl',t.avatar_url,'memberCount',(SELECT count(*) FROM public.people_thread_members WHERE thread_id=t.id)) INTO result FROM public.people_group_invites i JOIN public.people_threads t ON t.id=i.thread_id WHERE i.token=p_token AND t.kind='group' AND EXISTS (SELECT 1 FROM public.people_thread_members m WHERE m.thread_id=t.id AND m.user_id=t.created_by) AND NOT EXISTS (SELECT 1 FROM public.people_blocks b WHERE (b.blocker_id=auth.uid() AND b.blocked_id=t.created_by) OR (b.blocked_id=auth.uid() AND b.blocker_id=t.created_by));
RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.join_people_invite(p_token uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE tid uuid; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
SELECT thread_id INTO tid FROM public.people_group_invites WHERE token=p_token FOR UPDATE;
IF tid IS NULL OR public.preview_people_invite(p_token) IS NULL THEN RAISE EXCEPTION 'This invitation is no longer available'; END IF;
INSERT INTO public.people_thread_members(thread_id,user_id) VALUES (tid,auth.uid()) ON CONFLICT DO NOTHING;
RETURN tid;
END $$;
CREATE OR REPLACE FUNCTION public.edit_people_message(p_message uuid,p_content text,p_delete boolean DEFAULT false) RETURNS public.people_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result public.people_messages; BEGIN
SELECT * INTO result FROM public.people_messages WHERE id=p_message FOR UPDATE;
IF auth.uid() IS NULL OR result.id IS NULL OR result.sender_id IS DISTINCT FROM auth.uid() OR NOT public.is_people_member(result.thread_id) THEN RAISE EXCEPTION 'You can only change your own messages'; END IF;
IF result.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This message has been deleted'; END IF;
IF NOT p_delete AND length(trim(coalesce(p_content,''))) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Message must contain 1 to 8000 characters'; END IF;
UPDATE public.people_messages SET content=CASE WHEN p_delete THEN '' ELSE p_content END,edited_at=CASE WHEN p_delete THEN edited_at ELSE now() END,deleted_at=CASE WHEN p_delete THEN now() ELSE NULL END WHERE id=p_message RETURNING * INTO result; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.people_unread_counts() RETURNS TABLE(thread_id uuid,unread_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT m.thread_id,count(pm.id) FROM public.people_thread_members m LEFT JOIN public.people_messages pm ON pm.thread_id=m.thread_id AND pm.created_at>m.last_read_at AND pm.created_at>=m.joined_at AND pm.sender_id IS DISTINCT FROM auth.uid() AND pm.deleted_at IS NULL WHERE m.user_id=auth.uid() GROUP BY m.thread_id $$;
CREATE OR REPLACE FUNCTION public.mark_people_read(p_thread uuid,p_until timestamptz) RETURNS void LANGUAGE sql SET search_path=public AS $$ UPDATE public.people_thread_members SET last_read_at=greatest(last_read_at,least(p_until,now())) WHERE thread_id=p_thread AND user_id=auth.uid() $$;
REVOKE ALL ON FUNCTION public.update_people_group(uuid,text,text,text),public.people_group_invite(uuid,boolean),public.preview_people_invite(uuid),public.join_people_invite(uuid),public.edit_people_message(uuid,text,boolean),public.people_unread_counts(),public.mark_people_read(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_people_group(uuid,text,text,text),public.people_group_invite(uuid,boolean),public.preview_people_invite(uuid),public.join_people_invite(uuid),public.edit_people_message(uuid,text,boolean),public.people_unread_counts(),public.mark_people_read(uuid,timestamptz) TO authenticated,service_role;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='people_thread_members') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.people_thread_members; END IF; IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='people_threads') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.people_threads; END IF; END $$;