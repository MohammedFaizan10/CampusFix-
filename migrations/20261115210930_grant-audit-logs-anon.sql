-- Grant permissions on account_audit_logs to anon so API-key / Edge function requests can insert and select
GRANT SELECT, INSERT ON public.account_audit_logs TO anon, authenticated;
