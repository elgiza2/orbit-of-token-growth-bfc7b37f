DO $tests$
DECLARE owner_id uuid; member_id uuid; tid uuid; mid uuid; deleted_mid uuid;
  old_token uuid; new_token uuid; changed public.people_messages; denied boolean;
BEGIN
  SELECT p.id,q.id INTO owner_id,member_id FROM public.profiles p CROSS JOIN public.profiles q
  WHERE p.id<>q.id AND NOT EXISTS (SELECT 1 FROM public.people_blocks b WHERE
    (b.blocker_id=p.id AND b.blocked_id=q.id) OR (b.blocker_id=q.id AND b.blocked_id=p.id)) LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Two unblocked profiles are required for database regression tests'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
    INSERT INTO public.people_threads(kind,name,created_by) VALUES('group','RPC regression fixture',owner_id) RETURNING id INTO tid;
    INSERT INTO public.people_thread_members(thread_id,user_id,role,last_read_at,joined_at)
      VALUES(tid,owner_id,'owner',now()-interval '1 hour',now()-interval '1 hour');
    PERFORM public.update_people_group(tid,'Updated group','Description',NULL);
    IF NOT EXISTS(SELECT 1 FROM public.people_threads WHERE id=tid AND name='Updated group' AND description='Description') THEN RAISE EXCEPTION 'Group information did not persist'; END IF;
    old_token:=public.people_group_invite(tid,false);
    new_token:=public.people_group_invite(tid,true);
    IF old_token=new_token OR public.preview_people_invite(old_token) IS NOT NULL THEN RAISE EXCEPTION 'Reset did not invalidate the old invitation'; END IF;
    PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
    IF public.preview_people_invite(new_token) IS NULL THEN RAISE EXCEPTION 'Invitation preview unavailable'; END IF;
    IF EXISTS(SELECT 1 FROM public.people_thread_members WHERE thread_id=tid AND user_id=member_id) THEN RAISE EXCEPTION 'Preview implicitly joined the group'; END IF;
    PERFORM public.join_people_invite(new_token); PERFORM public.join_people_invite(new_token);
    IF (SELECT count(*) FROM public.people_thread_members WHERE thread_id=tid AND user_id=member_id)<>1 THEN RAISE EXCEPTION 'Join was not idempotent'; END IF;
    denied:=false; BEGIN PERFORM public.update_people_group(tid,'Unauthorized','',NULL); EXCEPTION WHEN OTHERS THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'A non-creator changed the group'; END IF;
    denied:=false; BEGIN PERFORM public.people_group_invite(tid,true); EXCEPTION WHEN OTHERS THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'A non-creator reset the invite'; END IF;
    UPDATE public.people_thread_members SET joined_at=now()-interval '1 hour',last_read_at=now()-interval '1 hour' WHERE thread_id=tid AND user_id=member_id;
    INSERT INTO public.people_messages(thread_id,sender_id,content,created_at) VALUES(tid,owner_id,'Original',now()-interval '10 seconds') RETURNING id INTO mid;
    INSERT INTO public.people_messages(thread_id,sender_id,content,created_at) VALUES(tid,owner_id,'Remove me',now()-interval '9 seconds') RETURNING id INTO deleted_mid;
    INSERT INTO public.people_messages(thread_id,sender_id,content,created_at) VALUES(tid,member_id,'Own message',now()-interval '8 seconds');
    denied:=false; BEGIN PERFORM public.edit_people_message(mid,'Stolen',false); EXCEPTION WHEN OTHERS THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'A different sender edited a message'; END IF;
    denied:=false; BEGIN PERFORM public.edit_people_message(mid,'',true); EXCEPTION WHEN OTHERS THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'A different sender deleted a message'; END IF;
    PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
    changed:=public.edit_people_message(mid,'Edited',false);
    IF changed.content<>'Edited' OR changed.edited_at IS NULL THEN RAISE EXCEPTION 'Own edit did not persist'; END IF;
    changed:=public.edit_people_message(deleted_mid,'',true);
    IF changed.content<>'' OR changed.deleted_at IS NULL THEN RAISE EXCEPTION 'Deletion retained the message content'; END IF;
    denied:=false; BEGIN PERFORM public.edit_people_message(deleted_mid,'Restored',false); EXCEPTION WHEN OTHERS THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Deleted message could be restored'; END IF;
    PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
    IF (SELECT unread_count FROM public.people_unread_counts() WHERE thread_id=tid)<>1 THEN RAISE EXCEPTION 'Unread count includes own/deleted messages'; END IF;
    PERFORM public.mark_people_read(tid,now());
    IF (SELECT unread_count FROM public.people_unread_counts() WHERE thread_id=tid)<>0 THEN RAISE EXCEPTION 'Read marker did not clear unread messages'; END IF;
    RAISE SQLSTATE 'PT001' USING MESSAGE='rollback successful fixtures';
  EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
  END;
  RAISE NOTICE 'People-chat RPC regression tests passed; fixture rows rolled back';
END $tests$;