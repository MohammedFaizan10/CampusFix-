-- Migration: 20261115201034_init-campusfix-schema.sql
-- Description: Initialize CampusFix+ tables, RLS policies, and seed data.

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USER PROFILES
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'STAFF', 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF', 'ADMIN', 'SUPER_ADMIN')),
  roll_number TEXT,
  employee_id TEXT,
  department TEXT,
  program TEXT,
  academic_year TEXT,
  section TEXT,
  semester INT,
  designation TEXT,
  phone TEXT,
  avatar_initials TEXT,
  avatar_color TEXT DEFAULT 'bg-indigo-600',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- 3. COMPLAINTS
CREATE TABLE IF NOT EXISTS public.complaints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'REJECTED', 'REOPENED')),
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_name TEXT,
  reported_by_email TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  department TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  ai_analysis JSONB DEFAULT NULL,
  timeline JSONB DEFAULT '[]'::jsonb,
  comments JSONB DEFAULT '[]'::jsonb,
  internal_notes JSONB DEFAULT '[]'::jsonb,
  rejection_reason TEXT,
  resolved_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_reported_by ON public.complaints(reported_by);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_to ON public.complaints(assigned_to);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON public.complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON public.complaints(created_at DESC);

-- 4. HELPER FUNCTIONS (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('STAFF', 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF', 'ADMIN', 'SUPER_ADMIN')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- 6. POLICIES: DEPARTMENTS
CREATE POLICY "anyone_can_read_departments" ON public.departments
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "admin_manage_departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. POLICIES: USER PROFILES
CREATE POLICY "authenticated_can_read_profiles" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "owner_or_admin_can_insert_profile" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "owner_or_admin_can_update_profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "admin_can_delete_profile" ON public.user_profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 8. POLICIES: COMPLAINTS
CREATE POLICY "complaints_select_policy" ON public.complaints
  FOR SELECT TO authenticated
  USING (
    reported_by = (SELECT auth.uid())
    OR assigned_to = (SELECT auth.uid())
    OR public.is_staff()
    OR public.is_admin()
  );

CREATE POLICY "complaints_insert_policy" ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = (SELECT auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "complaints_update_policy" ON public.complaints
  FOR UPDATE TO authenticated
  USING (
    reported_by = (SELECT auth.uid())
    OR assigned_to = (SELECT auth.uid())
    OR public.is_staff()
    OR public.is_admin()
  )
  WITH CHECK (
    reported_by = (SELECT auth.uid())
    OR assigned_to = (SELECT auth.uid())
    OR public.is_staff()
    OR public.is_admin()
  );

CREATE POLICY "complaints_delete_policy" ON public.complaints
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 9. GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.departments TO anon, authenticated;
GRANT ALL ON public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT ALL ON public.complaints TO authenticated;

-- 10. SEED DEPARTMENTS
INSERT INTO public.departments (code, name, description)
VALUES
  ('CIVIL', 'Civil Maintenance', 'Infrastructure, walls, masonry, floors and structural upkeep'),
  ('ELECTRICAL', 'Electrical Maintenance', 'Power distribution, lighting, wiring, switches and appliances'),
  ('PLUMBING', 'Plumbing & Water Management', 'Water supply, drainage, leaks, washroom sanitation and fixtures'),
  ('HOUSEKEEPING', 'Housekeeping & Sanitation', 'Cleanliness, garbage management, hygiene and pest control'),
  ('IT_SERVICES', 'IT & Network Services', 'Campus Wi-Fi, Ethernet, smart classroom tech and digital podiums'),
  ('ADMINISTRATIVE', 'Estate Administrative Office', 'General campus facilities coordination and executive triage')
ON CONFLICT (code) DO NOTHING;

