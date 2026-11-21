-- True when the caller may read (or, with _send, upload) a file stored under "<thread uuid>/..." in people-media.
CREATE OR REPLACE FUNCTION public.people_media_allowed(_name text, _send boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE folder text := split_part(_name, '/', 1);
BEGIN
  IF auth.uid() IS NULL OR folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
  IF _send THEN RETURN public.can_send_people(folder::uuid); END IF;
  RETURN public.is_people_member(folder::uuid);
END $$;
REVOKE EXECUTE ON FUNCTION public.people_media_allowed(text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.people_media_allowed(text, boolean) TO authenticated;

DROP POLICY IF EXISTS "people media read by members" ON storage.objects;
CREATE POLICY "people media read by members" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'people-media' AND public.people_media_allowed(name, false));
DROP POLICY IF EXISTS "people media upload by members" ON storage.objects;
CREATE POLICY "people media upload by members" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'people-media' AND owner = auth.uid() AND public.people_media_allowed(name, true));