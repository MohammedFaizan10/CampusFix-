-- Disable RLS on account_audit_logs for audit persistence
ALTER TABLE public.account_audit_logs DISABLE ROW LEVEL SECURITY;
