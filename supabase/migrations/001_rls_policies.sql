-- ============================================================================
-- Migration 001: Server-Side Row Level Security (RLS) for Furqan Used Cloth
-- Enforces ADMIN / STAFF permissions at the database layer using Supabase Auth.
-- Safe to run repeatedly (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper Function: public.current_app_role()
--    Reads the authenticated user's role ('ADMIN' or 'STAFF') from app_users
--    using the email claim from Supabase Auth JWT.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.app_users
  WHERE lower(email) = lower(auth.jwt() ->> 'email')
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_app_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Enable Row Level Security on all application tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. Drop any existing policies on these three tables to avoid conflicts
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('transactions', 'expense_accounts', 'app_users')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I;',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 4. Policies for public.transactions (TO authenticated)
--    - SELECT: ADMIN and STAFF
--    - INSERT / UPDATE: ADMIN for any row; STAFF only when tx_type <> 'CAPITAL'
--    - DELETE: ADMIN only
-- ----------------------------------------------------------------------------
CREATE POLICY "transactions_select_admin_staff"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (public.current_app_role() IN ('ADMIN', 'STAFF'));

CREATE POLICY "transactions_insert_admin_staff"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_app_role() = 'ADMIN'
    OR (public.current_app_role() = 'STAFF' AND tx_type <> 'CAPITAL')
  );

CREATE POLICY "transactions_update_admin_staff"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    public.current_app_role() = 'ADMIN'
    OR (public.current_app_role() = 'STAFF' AND tx_type <> 'CAPITAL')
  )
  WITH CHECK (
    public.current_app_role() = 'ADMIN'
    OR (public.current_app_role() = 'STAFF' AND tx_type <> 'CAPITAL')
  );

CREATE POLICY "transactions_delete_admin_only"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (public.current_app_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- 5. Policies for public.expense_accounts (TO authenticated)
--    - SELECT: ADMIN and STAFF
--    - INSERT / UPDATE / DELETE: ADMIN only
-- ----------------------------------------------------------------------------
CREATE POLICY "expense_accounts_select_admin_staff"
  ON public.expense_accounts
  FOR SELECT
  TO authenticated
  USING (public.current_app_role() IN ('ADMIN', 'STAFF'));

CREATE POLICY "expense_accounts_insert_admin_only"
  ON public.expense_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_app_role() = 'ADMIN');

CREATE POLICY "expense_accounts_update_admin_only"
  ON public.expense_accounts
  FOR UPDATE
  TO authenticated
  USING (public.current_app_role() = 'ADMIN')
  WITH CHECK (public.current_app_role() = 'ADMIN');

CREATE POLICY "expense_accounts_delete_admin_only"
  ON public.expense_accounts
  FOR DELETE
  TO authenticated
  USING (public.current_app_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- 6. Policies for public.app_users (TO authenticated)
--    - SELECT: own row or ADMIN
--    - No INSERT / UPDATE / DELETE policies (read-only from client)
-- ----------------------------------------------------------------------------
CREATE POLICY "app_users_select_self_or_admin"
  ON public.app_users
  FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
    OR public.current_app_role() = 'ADMIN'
  );

-- ----------------------------------------------------------------------------
-- 7. Table Privileges (lock down anon, grant scoped privileges to authenticated)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.transactions, public.expense_accounts, public.app_users FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions, public.expense_accounts TO authenticated;
GRANT SELECT ON public.app_users TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Ensure Opening Capital (400,000 PKR) exists if no CAPITAL row is present
-- ----------------------------------------------------------------------------
INSERT INTO public.transactions (tx_date, tx_type, category, description, total_amount)
SELECT CURRENT_DATE, 'CAPITAL', 'Opening Capital', 'Initial Cash Budget', 400000
WHERE NOT EXISTS (
  SELECT 1 FROM public.transactions WHERE tx_type = 'CAPITAL'
);
