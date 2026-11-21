CREATE OR REPLACE FUNCTION public.read_kashier_credentials()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
 SELECT jsonb_object_agg(s.name, s.decrypted_secret)
 FROM vault.decrypted_secrets s
 WHERE s.name IN ('KASHIER_MERCHANT_ID', 'KASHIER_PAYMENT_API_KEY')
$$;
REVOKE ALL ON FUNCTION public.read_kashier_credentials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_kashier_credentials() TO service_role;