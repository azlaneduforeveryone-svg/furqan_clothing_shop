-- ============================================================================
-- Expense accounts: STAFF can add and edit, only ADMIN can delete.
-- Runs after 001_rls_policies.sql. Safe to run more than once.
-- ============================================================================

DROP POLICY IF EXISTS "expense_accounts_insert_admin_only"  ON public.expense_accounts;
DROP POLICY IF EXISTS "expense_accounts_update_admin_only"  ON public.expense_accounts;
DROP POLICY IF EXISTS "expense_accounts_insert_admin_staff" ON public.expense_accounts;
DROP POLICY IF EXISTS "expense_accounts_update_admin_staff" ON public.expense_accounts;
-- Names used by the earlier 20261123161500_rls_policies.sql file, in case it was run
DROP POLICY IF EXISTS acc_insert ON public.expense_accounts;
DROP POLICY IF EXISTS acc_update ON public.expense_accounts;

CREATE POLICY "expense_accounts_insert_admin_staff"
  ON public.expense_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_app_role() IN ('ADMIN', 'STAFF'));

CREATE POLICY "expense_accounts_update_admin_staff"
  ON public.expense_accounts
  FOR UPDATE
  TO authenticated
  USING (public.current_app_role() IN ('ADMIN', 'STAFF'))
  WITH CHECK (public.current_app_role() IN ('ADMIN', 'STAFF'));

-- DELETE stays ADMIN only: "expense_accounts_delete_admin_only" from 001 is unchanged.

-- Check (run separately):
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'expense_accounts' ORDER BY cmd;
