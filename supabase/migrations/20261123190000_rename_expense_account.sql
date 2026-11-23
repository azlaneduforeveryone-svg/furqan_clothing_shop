-- ============================================================================
-- Migration: Atomic Expense Account Rename RPC
-- Updates expense_accounts and migrates matching EXPENSE transactions in one
-- transaction while preserving caller RLS permissions (SECURITY INVOKER).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rename_expense_account(
  p_id uuid,
  p_name text,
  p_default numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old_name text;
  v_new_name text;
BEGIN
  v_new_name := btrim(coalesce(p_name, ''));
  IF v_new_name = '' THEN
    RAISE EXCEPTION 'Expense account name cannot be empty.';
  END IF;

  SELECT name
  INTO v_old_name
  FROM public.expense_accounts
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense account not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expense_accounts
    WHERE lower(name) = lower(v_new_name)
      AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'An expense account with this name already exists.';
  END IF;

  UPDATE public.expense_accounts
  SET
    name = v_new_name,
    default_amount = coalesce(p_default, 0)
  WHERE id = p_id;

  IF v_old_name IS DISTINCT FROM v_new_name THEN
    UPDATE public.transactions
    SET category = v_new_name
    WHERE tx_type = 'EXPENSE'
      AND category = v_old_name;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_expense_account(uuid, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rename_expense_account(uuid, text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.rename_expense_account(uuid, text, numeric) TO authenticated;
