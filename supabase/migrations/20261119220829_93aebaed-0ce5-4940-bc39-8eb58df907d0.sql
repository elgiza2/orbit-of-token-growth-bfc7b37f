REVOKE EXECUTE ON FUNCTION public.can_send_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_people(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_people_thread_for_all(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_people_thread_for_all(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS agent_documents_bot_idx ON public.agent_documents(bot_id);
CREATE INDEX IF NOT EXISTS agent_artifacts_bot_idx ON public.agent_artifacts(bot_id);
CREATE INDEX IF NOT EXISTS people_blocks_blocked_idx ON public.people_blocks(blocked_id);
CREATE TRIGGER vault_items_updated BEFORE UPDATE ON public.vault_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();