-- ============================================================================
-- Furqan Used Cloth Business - Cash-Basis Accounting Schema (Supabase / PostgreSQL)
-- Run this entire script in the Supabase SQL Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. App Users (Links Supabase Auth Emails to Application Roles: ADMIN / STAFF)
--    1) Enable Email provider in Supabase -> Authentication -> Providers
--    2) Create these user accounts with passwords in Authentication -> Users
--    3) Run this script to map their emails to ADMIN or STAFF roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  pin TEXT DEFAULT '0000',
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  display_name TEXT NOT NULL
);

-- Safe migration if app_users already existed from the legacy PIN schema
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE public.app_users ALTER COLUMN pin DROP NOT NULL;
ALTER TABLE public.app_users ALTER COLUMN pin SET DEFAULT '0000';

INSERT INTO public.app_users (username, email, pin, role, display_name)
VALUES
  ('admin', 'azlaneduforeveryone@gmail.com', '0000', 'ADMIN', 'Azlan (Admin)'),
  ('furqan', 'furqan.mahmood95@gmail.com', '0000', 'STAFF', 'Furqan (Shop Staff)')
ON CONFLICT (username) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- ----------------------------------------------------------------------------
-- 2. Expense Accounts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  default_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.expense_accounts (name, default_amount)
VALUES
  ('Shop Rent', 2500),
  ('Electricity Bill', 0),
  ('Shop Tea / Food', 0),
  ('Shopping Bags & Packing', 0),
  ('Other Shop Expense', 0)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Cash-Basis Transactions Ledger
--    total_amount: positive (+) for inflows (CAPITAL, SALE)
--                  negative (-) for outflows (PURCHASE, EXPENSE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('CAPITAL', 'SALE', 'PURCHASE', 'EXPENSE')),
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  pieces_count INTEGER NOT NULL DEFAULT 0,
  bundle_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  labour_other_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  per_piece_cost NUMERIC(12, 2) GENERATED ALWAYS AS (
    CASE
      WHEN pieces_count > 0 THEN (bundle_price + transport_cost + labour_other_cost) / pieces_count
      ELSE 0
    END
  ) STORED,
  total_amount NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_tx_date
  ON public.transactions (tx_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_tx_type
  ON public.transactions (tx_type);

-- Seed initial Opening Capital (400,000 PKR) if no CAPITAL record exists
INSERT INTO public.transactions (tx_date, tx_type, category, description, total_amount)
SELECT CURRENT_DATE, 'CAPITAL', 'Opening Capital', 'Initial Cash Budget', 400000
WHERE NOT EXISTS (
  SELECT 1 FROM public.transactions WHERE tx_type = 'CAPITAL'
);

-- ----------------------------------------------------------------------------
-- 4. Access Permissions (PIN login is handled at app layer via app_users)
-- ----------------------------------------------------------------------------
ALTER TABLE public.app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
