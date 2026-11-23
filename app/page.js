"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calculator,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  LogOut,
  Mail,
  Package,
  Plus,
  PlusCircle,
  Receipt,
  RefreshCw,
  RotateCcw,
  Share2,
  Shirt,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  exportToExcel,
  exportToPDF,
  sharePDFReport,
} from "@/utils/exportReports";

const SESSION_STORAGE_KEY = "furqan_cloth_session_v1";

const CLOTH_TYPES = [
  "Men Jeans / Denim",
  "Men T-Shirts & Polos",
  "Men Dress Shirts",
  "Winter Jackets & Hoodies",
  "Ladies Kurtis & Suits",
  "Ladies Shawls & Dupattas",
  "Kids Mix Bundle",
  "Bed Sheets & Blankets",
  "Mixed Grade-A Bundle",
];

const DEFAULT_EXPENSE_ACCOUNTS = [
  { name: "Shop Rent", default_amount: 2500 },
  { name: "Electricity Bill", default_amount: 0 },
  { name: "Shop Tea / Food", default_amount: 0 },
  { name: "Shopping Bags & Packing", default_amount: 0 },
  { name: "Other Shop Expense", default_amount: 0 },
];

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatPKR(value, decimals = 0) {
  const num = Number(value) || 0;
  return `PKR ${num.toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatShortDate(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split("-");
  if (parts.length !== 3) return isoDate;
  const dateObj = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );
  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function parseAmount(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function FurqanClothApp() {
  // Auth / Session state
  const [sessionUser, setSessionUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Core data state
  const [transactions, setTransactions] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  // UI state
  const [activeTab, setActiveTab] = useState("ledger"); // 'ledger' | 'costing'
  const [ledgerFilter, setLedgerFilter] = useState("ALL"); // 'ALL' | 'SALE' | 'PURCHASE' | 'EXPENSE'
  const [toast, setToast] = useState(null);

  // Modal state
  const [activeModal, setActiveModal] = useState(null); // null | 'SALE' | 'PURCHASE' | 'EXPENSE' | 'CAPITAL' | 'ACCOUNT' | 'RESET'
  const [editingTx, setEditingTx] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Capital form state (ADMIN only)
  const [capitalDate, setCapitalDate] = useState(getTodayISO());
  const [capitalSource, setCapitalSource] = useState("Additional Capital");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [capitalNotes, setCapitalNotes] = useState("");

  // Sale form state
  const [saleDate, setSaleDate] = useState(getTodayISO());
  const [saleCategory, setSaleCategory] = useState("Daily Cash Sales");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  // Bundle Purchase form state
  const [purchaseDate, setPurchaseDate] = useState(getTodayISO());
  const [clothType, setClothType] = useState(CLOTH_TYPES[0]);
  const [piecesCount, setPiecesCount] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [transportCost, setTransportCost] = useState("0");
  const [labourCost, setLabourCost] = useState("0");
  const [purchaseNotes, setPurchaseNotes] = useState("");

  // Expense form state
  const [expenseDate, setExpenseDate] = useState(getTodayISO());
  const [expenseCategory, setExpenseCategory] = useState("Shop Rent");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

  // New Expense Account form state (ADMIN only)
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountDefault, setNewAccountDefault] = useState("0");

  const isAdmin = sessionUser?.role === "ADMIN";

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3200);
  }, []);

  // Look up user's role in app_users by Supabase Auth email
  const resolveUserProfile = useCallback(async (authUser) => {
    const normalizedEmail = String(authUser?.email || "").toLowerCase();
    const fallbackProfile = {
      id: authUser?.id || "",
      email: authUser?.email || "",
      role: "STAFF",
      display_name: authUser?.email || "Staff",
    };

    if (!supabase || !normalizedEmail) {
      return fallbackProfile;
    }

    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("id, username, email, role, display_name")
        .eq("email", normalizedEmail)
        .single();

      if (error || !data) {
        return fallbackProfile;
      }

      return {
        id: data.id || authUser.id,
        username: data.username || "",
        email: data.email || authUser.email,
        role: data.role === "ADMIN" ? "ADMIN" : "STAFF",
        display_name: data.display_name || authUser.email,
      };
    } catch {
      return fallbackProfile;
    }
  }, []);

  // Hydrate Supabase Auth session on load & subscribe to auth state changes
  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      setAuthChecked(true);
      return;
    }

    const syncSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (data?.session?.user) {
          const profile = await resolveUserProfile(data.session.user);
          if (!isMounted) return;
          setSessionUser(profile);
          try {
            window.localStorage.setItem(
              SESSION_STORAGE_KEY,
              JSON.stringify(profile)
            );
          } catch {
            // Ignore storage errors
          }
        } else {
          setSessionUser(null);
          try {
            window.localStorage.removeItem(SESSION_STORAGE_KEY);
          } catch {
            // Ignore storage errors
          }
        }
      } catch {
        if (isMounted) setSessionUser(null);
      } finally {
        if (isMounted) setAuthChecked(true);
      }
    };

    syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        resolveUserProfile(session.user).then((profile) => {
          if (!isMounted) return;
          setSessionUser(profile);
          try {
            window.localStorage.setItem(
              SESSION_STORAGE_KEY,
              JSON.stringify(profile)
            );
          } catch {
            // Ignore storage errors
          }
        });
      } else {
        setSessionUser(null);
        setTransactions([]);
        try {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          // Ignore storage errors
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [resolveUserProfile]);

  // Load transactions & expense accounts from Supabase
  const fetchAllData = useCallback(async () => {
    if (!supabase) return;
    setLoadingData(true);
    setDataError("");
    try {
      const [txRes, accRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .order("tx_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("expense_accounts")
          .select("*")
          .order("created_at", { ascending: true }),
      ]);

      if (txRes.error) throw txRes.error;
      if (accRes.error) throw accRes.error;

      setTransactions(txRes.data || []);
      setExpenseAccounts(
        accRes.data && accRes.data.length > 0
          ? accRes.data
          : DEFAULT_EXPENSE_ACCOUNTS
      );
    } catch (err) {
      setDataError(
        err?.message ||
          "Failed to load data from Supabase. Make sure you ran supabase/schema.sql."
      );
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (sessionUser && isSupabaseConfigured) {
      fetchAllData();
    }
  }, [sessionUser, fetchAllData]);

  // Derived financial metrics (Strictly Cash-Basis)
  const summary = useMemo(() => {
    let openingCapital = 0;
    let totalSales = 0;
    let totalPurchases = 0;
    let totalExpenses = 0;
    let cashInHand = 0;

    for (const tx of transactions) {
      const amt = Number(tx.total_amount) || 0;
      cashInHand += amt;
      if (tx.tx_type === "CAPITAL") {
        openingCapital += amt;
      } else if (tx.tx_type === "SALE") {
        totalSales += amt;
      } else if (tx.tx_type === "PURCHASE") {
        totalPurchases += Math.abs(amt);
      } else if (tx.tx_type === "EXPENSE") {
        totalExpenses += Math.abs(amt);
      }
    }

    return {
      openingCapital,
      totalSales,
      totalPurchases,
      totalExpenses,
      totalSpent: totalPurchases + totalExpenses,
      cashInHand,
    };
  }, [transactions]);

  // Daily Sales vs Daily Spending chart data
  const chartData = useMemo(() => {
    const byDate = new Map();

    for (const tx of transactions) {
      if (tx.tx_type === "CAPITAL") continue;
      const dateKey = tx.tx_date || "Unknown";
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, {
          dateKey,
          label: formatShortDate(dateKey),
          sales: 0,
          spending: 0,
        });
      }
      const entry = byDate.get(dateKey);
      const amt = Number(tx.total_amount) || 0;
      if (tx.tx_type === "SALE") {
        entry.sales += Math.abs(amt);
      } else if (tx.tx_type === "PURCHASE" || tx.tx_type === "EXPENSE") {
        entry.spending += Math.abs(amt);
      }
    }

    return Array.from(byDate.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-10);
  }, [transactions]);

  // Cloth Costing aggregation by Cloth Type
  const clothCosting = useMemo(() => {
    const groups = new Map();

    for (const tx of transactions) {
      if (tx.tx_type !== "PURCHASE") continue;
      const key = tx.category || "Uncategorized Bundle";
      if (!groups.has(key)) {
        groups.set(key, {
          clothType: key,
          bundlesCount: 0,
          totalPieces: 0,
          totalBundlePrice: 0,
          totalTransport: 0,
          totalLabour: 0,
          totalLandedSpend: 0,
          avgPerPiece: 0,
        });
      }
      const g = groups.get(key);
      const bPrice = Number(tx.bundle_price) || 0;
      const tCost = Number(tx.transport_cost) || 0;
      const lCost = Number(tx.labour_other_cost) || 0;
      const landed = Math.abs(Number(tx.total_amount) || bPrice + tCost + lCost);

      g.bundlesCount += 1;
      g.totalPieces += Number(tx.pieces_count) || 0;
      g.totalBundlePrice += bPrice;
      g.totalTransport += tCost;
      g.totalLabour += lCost;
      g.totalLandedSpend += landed;
    }

    return Array.from(groups.values())
      .map((g) => ({
        ...g,
        avgPerPiece: g.totalPieces > 0 ? g.totalLandedSpend / g.totalPieces : 0,
      }))
      .sort((a, b) => b.totalLandedSpend - a.totalLandedSpend);
  }, [transactions]);

  // Filtered ledger list
  const filteredTransactions = useMemo(() => {
    if (ledgerFilter === "ALL") return transactions;
    return transactions.filter((tx) => tx.tx_type === ledgerFilter);
  }, [transactions, ledgerFilter]);

  // Live bundle landed preview
  const bundlePreview = useMemo(() => {
    const pieces = parseInt(piecesCount, 10) || 0;
    const bPrice = parseAmount(bundlePrice);
    const tCost = parseAmount(transportCost);
    const lCost = parseAmount(labourCost);
    const totalOutflow = bPrice + tCost + lCost;
    const perPiece = pieces > 0 ? totalOutflow / pieces : 0;
    return { pieces, bPrice, tCost, lCost, totalOutflow, perPiece };
  }, [piecesCount, bundlePrice, transportCost, labourCost]);

  // Email & Password Login Handler (Supabase Auth)
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");

    if (!isSupabaseConfigured || !supabase) {
      setLoginError(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }

    const email = loginEmail.trim().toLowerCase();
    if (!email || !loginPassword) {
      setLoginError("Please enter both your email and password.");
      return;
    }

    setLoginLoading(true);
    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password: loginPassword,
        });

      if (authError || !authData?.user) {
        setLoginError(
          authError?.message || "Invalid email or password. Please try again."
        );
        return;
      }

      const profile = await resolveUserProfile(authData.user);
      try {
        window.localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(profile)
        );
      } catch {
        // Ignore storage errors
      }
      setSessionUser(profile);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err?.message || "Sign in failed. Check your connection.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch {
      // Proceed with local cleanup even if signOut request fails
    }
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    setSessionUser(null);
    setTransactions([]);
    setLoginPassword("");
    setActiveModal(null);
    setEditingTx(null);
  };

  // Modal Open Helpers
  const openSaleModal = (tx = null) => {
    if (tx && !isAdmin) return;
    setEditingTx(tx);
    if (tx) {
      setSaleDate(tx.tx_date || getTodayISO());
      setSaleCategory(tx.category || "Daily Cash Sales");
      setSaleAmount(String(Math.abs(Number(tx.total_amount) || 0)));
      setSaleNotes(tx.description || "");
    } else {
      setSaleDate(getTodayISO());
      setSaleCategory("Daily Cash Sales");
      setSaleAmount("");
      setSaleNotes("");
    }
    setActiveModal("SALE");
  };

  const openPurchaseModal = (tx = null) => {
    if (tx && !isAdmin) return;
    setEditingTx(tx);
    if (tx) {
      setPurchaseDate(tx.tx_date || getTodayISO());
      setClothType(tx.category || CLOTH_TYPES[0]);
      setPiecesCount(String(tx.pieces_count || ""));
      setBundlePrice(String(tx.bundle_price || ""));
      setTransportCost(String(tx.transport_cost || "0"));
      setLabourCost(String(tx.labour_other_cost || "0"));
      setPurchaseNotes(tx.description || "");
    } else {
      setPurchaseDate(getTodayISO());
      setClothType(CLOTH_TYPES[0]);
      setPiecesCount("");
      setBundlePrice("");
      setTransportCost("0");
      setLabourCost("0");
      setPurchaseNotes("");
    }
    setActiveModal("PURCHASE");
  };

  const openExpenseModal = (presetAccountName = null, presetAmount = null, tx = null) => {
    if (tx && !isAdmin) return;
    setEditingTx(tx);
    if (tx) {
      setExpenseDate(tx.tx_date || getTodayISO());
      setExpenseCategory(tx.category || "Shop Rent");
      setExpenseAmount(String(Math.abs(Number(tx.total_amount) || 0)));
      setExpenseNotes(tx.description || "");
    } else {
      const targetName =
        presetAccountName || expenseAccounts[0]?.name || "Shop Rent";
      const matched = expenseAccounts.find((a) => a.name === targetName);
      const autoAmount =
        presetAmount !== null
          ? String(presetAmount)
          : matched && Number(matched.default_amount) > 0
          ? String(matched.default_amount)
          : "";

      setExpenseDate(getTodayISO());
      setExpenseCategory(targetName);
      setExpenseAmount(autoAmount);
      setExpenseNotes("");
    }
    setActiveModal("EXPENSE");
  };

  const openCapitalModal = (tx = null) => {
    if (!isAdmin) return;
    setEditingTx(tx);
    if (tx) {
      setCapitalDate(tx.tx_date || getTodayISO());
      setCapitalSource(tx.category || "Additional Capital");
      setCapitalAmount(String(Math.abs(Number(tx.total_amount) || 0)));
      setCapitalNotes(tx.description || "");
    } else {
      setCapitalDate(getTodayISO());
      setCapitalSource("Additional Capital");
      setCapitalAmount("");
      setCapitalNotes("");
    }
    setActiveModal("CAPITAL");
  };

  const openEditTransaction = (tx) => {
    if (!isAdmin) return;
    if (tx.tx_type === "SALE") {
      openSaleModal(tx);
    } else if (tx.tx_type === "PURCHASE") {
      openPurchaseModal(tx);
    } else if (tx.tx_type === "EXPENSE") {
      openExpenseModal(null, null, tx);
    } else if (tx.tx_type === "CAPITAL") {
      openCapitalModal(tx);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setEditingTx(null);
  };

  // Save Sale (or Capital edit)
  const handleSaveSale = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    if (editingTx && !isAdmin) return;

    const amount = parseAmount(saleAmount);
    if (amount <= 0) {
      showToast("Enter a valid positive cash amount.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        tx_date: saleDate,
        tx_type: editingTx?.tx_type === "CAPITAL" ? "CAPITAL" : "SALE",
        category: saleCategory.trim() || "Daily Cash Sales",
        description: saleNotes.trim(),
        pieces_count: 0,
        bundle_price: 0,
        transport_cost: 0,
        labour_other_cost: 0,
        total_amount: amount,
      };

      const { error } = editingTx
        ? await supabase
            .from("transactions")
            .update(payload)
            .eq("id", editingTx.id)
        : await supabase.from("transactions").insert([payload]);

      if (error) throw error;
      await fetchAllData();
      closeModal();
      showToast(editingTx ? "Entry updated." : "Cash sale recorded!");
    } catch (err) {
      showToast(err?.message || "Could not save sale.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Save Bundle Purchase
  const handleSavePurchase = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    if (editingTx && !isAdmin) return;

    const { pieces, bPrice, tCost, lCost, totalOutflow } = bundlePreview;
    if (pieces <= 0) {
      showToast("Enter the number of pieces in the bundle.", "error");
      return;
    }
    if (totalOutflow <= 0) {
      showToast("Enter a valid bundle price.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        tx_date: purchaseDate,
        tx_type: "PURCHASE",
        category: clothType,
        description: purchaseNotes.trim(),
        pieces_count: pieces,
        bundle_price: bPrice,
        transport_cost: tCost,
        labour_other_cost: lCost,
        total_amount: -totalOutflow,
      };

      const { error } = editingTx
        ? await supabase
            .from("transactions")
            .update(payload)
            .eq("id", editingTx.id)
        : await supabase.from("transactions").insert([payload]);

      if (error) throw error;
      await fetchAllData();
      closeModal();
      showToast(
        editingTx
          ? "Bundle updated & per-piece cost recalculated."
          : "Bundle purchase recorded!"
      );
    } catch (err) {
      showToast(err?.message || "Could not save bundle purchase.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Save Expense
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    if (editingTx && !isAdmin) return;

    const amount = parseAmount(expenseAmount);
    if (amount <= 0) {
      showToast("Enter a valid expense amount.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        tx_date: expenseDate,
        tx_type: "EXPENSE",
        category: expenseCategory,
        description: expenseNotes.trim(),
        pieces_count: 0,
        bundle_price: 0,
        transport_cost: 0,
        labour_other_cost: 0,
        total_amount: -amount,
      };

      const { error } = editingTx
        ? await supabase
            .from("transactions")
            .update(payload)
            .eq("id", editingTx.id)
        : await supabase.from("transactions").insert([payload]);

      if (error) throw error;
      await fetchAllData();
      closeModal();
      showToast(editingTx ? "Expense updated." : "Shop expense recorded!");
    } catch (err) {
      showToast(err?.message || "Could not save expense.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Save Capital Injection (ADMIN ONLY)
  const handleSaveCapital = async (e) => {
    e.preventDefault();
    if (!isAdmin || !supabase) return;

    const amount = parseAmount(capitalAmount);
    if (amount <= 0) {
      showToast("Enter a valid positive capital amount.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        tx_date: capitalDate,
        tx_type: "CAPITAL",
        category: capitalSource.trim() || "Additional Capital",
        description: capitalNotes.trim(),
        pieces_count: 0,
        bundle_price: 0,
        transport_cost: 0,
        labour_other_cost: 0,
        total_amount: amount,
      };

      const { error } = editingTx
        ? await supabase
            .from("transactions")
            .update(payload)
            .eq("id", editingTx.id)
        : await supabase.from("transactions").insert([payload]);

      if (error) throw error;
      await fetchAllData();
      closeModal();
      showToast(
        editingTx ? "Capital entry updated." : "Additional capital added!"
      );
    } catch (err) {
      showToast(err?.message || "Could not save capital entry.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Transaction (ADMIN ONLY)
  const handleDeleteTransaction = async (tx) => {
    if (!isAdmin || !supabase) return;
    const confirmed = window.confirm(
      `Delete this ${tx.tx_type} entry (${tx.category} - ${formatPKR(
        Math.abs(Number(tx.total_amount) || 0)
      )})?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", tx.id);
      if (error) throw error;
      await fetchAllData();
      showToast("Transaction deleted.");
    } catch (err) {
      showToast(err?.message || "Failed to delete entry.", "error");
    }
  };

  // Add New Expense Account (ADMIN ONLY)
  const handleAddExpenseAccount = async (e) => {
    e.preventDefault();
    if (!isAdmin || !supabase) return;

    const name = newAccountName.trim();
    if (!name) {
      showToast("Enter an expense account name.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("expense_accounts").insert([
        {
          name,
          default_amount: parseAmount(newAccountDefault),
        },
      ]);
      if (error) throw error;
      await fetchAllData();
      setNewAccountName("");
      setNewAccountDefault("0");
      closeModal();
      showToast(`Added "${name}" expense account.`);
    } catch (err) {
      showToast(err?.message || "Could not add expense account.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Reset All Data & Restore 400,000 PKR Capital (ADMIN ONLY)
  const handleResetData = async () => {
    if (!isAdmin || !supabase) return;

    setSubmitting(true);
    try {
      // Delete all existing transactions
      const { error: delError } = await supabase
        .from("transactions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (delError) throw delError;

      // Restore 400,000 PKR Opening Capital
      const { error: insError } = await supabase.from("transactions").insert([
        {
          tx_date: getTodayISO(),
          tx_type: "CAPITAL",
          category: "Opening Capital",
          description: "Initial Cash Budget",
          pieces_count: 0,
          bundle_price: 0,
          transport_cost: 0,
          labour_other_cost: 0,
          total_amount: 400000,
        },
      ]);

      if (insError) throw insError;
      await fetchAllData();
      closeModal();
      showToast("All transactions reset. 400,000 PKR capital restored.");
    } catch (err) {
      showToast(err?.message || "Failed to reset data.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Report Export Handlers
  const handleExportExcel = () => {
    try {
      exportToExcel({ transactions, clothCosting, summary });
      showToast("Excel 3-sheet workbook downloaded!");
    } catch (err) {
      showToast(err?.message || "Excel export failed.", "error");
    }
  };

  const handleExportPDF = () => {
    try {
      exportToPDF({ transactions, clothCosting, summary });
      showToast("Color-coded PDF statement downloaded!");
    } catch (err) {
      showToast(err?.message || "PDF export failed.", "error");
    }
  };

  const handleSharePDF = async () => {
    try {
      const result = await sharePDFReport({
        transactions,
        clothCosting,
        summary,
      });
      if (result.shared) {
        showToast("Statement ready to share!");
      } else {
        showToast("PDF downloaded (direct file share is available on mobile).");
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      showToast(err?.message || "Could not share report.", "error");
    }
  };

  // Wait for localStorage hydration
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-pulse text-sm font-medium text-slate-500">
          Loading Furqan Cash Ledger...
        </div>
      </div>
    );
  }

  // ============================================================================
  // LOGIN SCREEN
  // ============================================================================
  if (!sessionUser) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
          <div className="bg-slate-900 px-6 pt-8 pb-6 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <Shirt className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Furqan Used Cloth Business
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Cash-Basis Accounting &amp; Bundle Costing (PKR)
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-5">
            {!isSupabaseConfigured && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 leading-relaxed">
                <p className="font-semibold mb-1">Supabase Setup Required</p>
                Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
                and{" "}
                <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                to <code className="font-mono">.env.local</code> (or Vercel
                Environment Variables) and run{" "}
                <code className="font-mono">supabase/schema.sql</code>.
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => {
                    setLoginEmail(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-base shadow-md transition-all disabled:opacity-60"
            >
              {loginLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ============================================================================
  // MAIN MOBILE-FIRST DASHBOARD
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold border ${
              toast.type === "error"
                ? "bg-rose-600 text-white border-rose-700"
                : "bg-slate-900 text-white border-slate-800"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto min-h-screen bg-slate-50 shadow-sm">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3.5 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Shirt className="w-5 h-5 text-emerald-400 shrink-0" />
                <h1 className="text-base font-bold truncate">
                  Furqan Used Cloth
                </h1>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isAdmin ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
                {sessionUser.display_name} ({sessionUser.role})
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={fetchAllData}
                title="Refresh Data"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingData ? "animate-spin" : ""}`}
                />
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveModal("RESET")}
                  title="Reset Data"
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                title="Logout"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {/* Error Banner */}
          {dataError && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
              <p className="font-bold">Database Error</p>
              <p className="mt-0.5">{dataError}</p>
            </div>
          )}

          {/* Top Cash-in-Hand Summary Card */}
          <section className="rounded-3xl bg-slate-900 text-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-400" />
                Available Cash in Hand
              </span>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                Cash-Basis
              </span>
            </div>

            <div className="mt-2 text-3xl font-extrabold tracking-tight">
              {formatPKR(summary.cashInHand)}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/25 p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  Total Cash Sales
                </div>
                <div className="mt-1 text-base font-bold text-emerald-200">
                  +{formatPKR(summary.totalSales)}
                </div>
              </div>

              <div className="rounded-2xl bg-rose-500/15 border border-rose-400/25 p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-300">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  Total Cash Spent
                </div>
                <div className="mt-1 text-base font-bold text-rose-200">
                  -{formatPKR(summary.totalSpent)}
                </div>
              </div>
            </div>
          </section>

          {/* Primary Action Buttons */}
          <section className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => openSaleModal()}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>Add Sale</span>
            </button>

            <button
              type="button"
              onClick={() => openPurchaseModal()}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold text-xs shadow-sm transition-all"
            >
              <Package className="w-5 h-5" />
              <span>Buy Bundle</span>
            </button>

            <button
              type="button"
              onClick={() => openExpenseModal()}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-2xl bg-rose-800 hover:bg-rose-900 active:scale-[0.98] text-white font-bold text-xs shadow-sm transition-all"
            >
              <Receipt className="w-5 h-5" />
              <span>Add Expense</span>
            </button>
          </section>

          {/* 1-Tap Monthly Shop Bills + Admin Quick Actions */}
          <section className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1-Tap Monthly Shop Bills
              </span>
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openCapitalModal()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Capital
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal("ACCOUNT")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Expense Account
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => openExpenseModal("Shop Rent", 2500)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left transition-colors active:scale-[0.99]"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-200/70 text-rose-800 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-rose-900 truncate">
                    Rent (2,500 PKR)
                  </div>
                  <div className="text-[11px] text-rose-700">1-Tap Entry</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openExpenseModal("Electricity Bill", "")}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left transition-colors active:scale-[0.99]"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-200/70 text-rose-800 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-rose-900 truncate">
                    Electricity Bill
                  </div>
                  <div className="text-[11px] text-rose-700">Quick Entry</div>
                </div>
              </button>
            </div>
          </section>

          {/* Export & Share Reports Bar */}
          <section className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shadow-xs transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shadow-xs transition-colors"
            >
              <FileText className="w-4 h-4 text-rose-600" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSharePDF}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold shadow-xs transition-colors"
            >
              <Share2 className="w-4 h-4 text-emerald-700" />
              <span>Send</span>
            </button>
          </section>

          {/* Daily Sales vs Daily Spending Chart */}
          <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-slate-600" />
                Daily Sales vs. Spending
              </h2>
              <span className="text-[11px] text-slate-400">PKR</span>
            </div>

            {chartData.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <BarChart3 className="w-7 h-7 mb-1.5 opacity-40" />
                Record a sale, bundle, or expense to see the daily chart.
              </div>
            ) : (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 6, right: 6, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatPKR(value)}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="sales"
                      name="Sales"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="spending"
                      name="Spending"
                      fill="#f43f5e"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Tabs: Daily Cash Ledger & Cloth Costing */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveTab("ledger")}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "ledger"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Daily Cash Ledger ({transactions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("costing")}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "costing"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Cloth Costing ({clothCosting.length})
              </button>
            </div>

            {/* TAB 1: DAILY CASH LEDGER */}
            {activeTab === "ledger" && (
              <div className="space-y-2.5">
                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {[
                    { id: "ALL", label: "All" },
                    { id: "SALE", label: "Sales" },
                    { id: "PURCHASE", label: "Bundles" },
                    { id: "EXPENSE", label: "Expenses" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLedgerFilter(f.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                        ledgerFilter === f.id
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-xs text-slate-400">
                    No matching transactions found.
                  </div>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isSale = tx.tx_type === "SALE";
                    const isSpending =
                      tx.tx_type === "PURCHASE" || tx.tx_type === "EXPENSE";
                    const isPurchase = tx.tx_type === "PURCHASE";
                    const amt = Number(tx.total_amount) || 0;
                    const pieces = Number(tx.pieces_count) || 0;
                    const perPiece =
                      Number(tx.per_piece_cost) ||
                      (pieces > 0
                        ? (Number(tx.bundle_price || 0) +
                            Number(tx.transport_cost || 0) +
                            Number(tx.labour_other_cost || 0)) /
                          pieces
                        : 0);

                    const cardClass = isSale
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : isSpending
                      ? "bg-rose-50 border-rose-200 text-rose-900"
                      : "bg-indigo-50 border-indigo-200 text-indigo-900";

                    const amountClass = isSale
                      ? "text-emerald-700"
                      : isSpending
                      ? "text-rose-700"
                      : "text-indigo-700";

                    return (
                      <div
                        key={tx.id}
                        className={`rounded-2xl border p-3.5 shadow-xs ${cardClass}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                  isSale
                                    ? "bg-emerald-200/70 text-emerald-900"
                                    : isSpending
                                    ? "bg-rose-200/70 text-rose-900"
                                    : "bg-indigo-200/70 text-indigo-900"
                                }`}
                              >
                                {tx.tx_type}
                              </span>
                              <span className="text-[11px] opacity-75 font-medium">
                                {formatShortDate(tx.tx_date)}
                              </span>
                            </div>

                            <h3 className="font-bold text-sm mt-1 truncate">
                              {tx.category}
                            </h3>

                            {tx.description && (
                              <p className="text-xs opacity-80 mt-0.5 break-words">
                                {tx.description}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`text-base font-extrabold ${amountClass}`}
                            >
                              {amt >= 0 ? "+" : "-"}
                              {formatPKR(Math.abs(amt))}
                            </div>

                            {/* Admin-only Edit & Delete */}
                            {isAdmin && (
                              <div className="mt-2 flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditTransaction(tx)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/85 hover:bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTransaction(tx)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/85 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-semibold"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Red Per-Piece Cost Badge & Breakdown for Bundle Purchases */}
                        {isPurchase && (
                          <div className="mt-2.5 pt-2.5 border-t border-rose-200/80 flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] font-bold shadow-xs">
                              <Calculator className="w-3 h-3" />
                              {formatPKR(perPiece, 2)} / piece
                            </span>
                            <span className="text-[11px] text-rose-800 font-medium">
                              {pieces} pcs • Bundle{" "}
                              {formatPKR(tx.bundle_price)} + Trans{" "}
                              {formatPKR(tx.transport_cost)} + Lab{" "}
                              {formatPKR(tx.labour_other_cost)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: CLOTH COSTING AGGREGATION */}
            {activeTab === "costing" && (
              <div className="space-y-2.5">
                {clothCosting.length === 0 ? (
                  <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-xs text-slate-400">
                    <Layers className="w-7 h-7 mx-auto mb-2 opacity-40" />
                    No bundle purchases recorded yet. Tap &ldquo;Buy
                    Bundle&rdquo; to calculate landed per-piece costs.
                  </div>
                ) : (
                  clothCosting.map((item) => (
                    <div
                      key={item.clothType}
                      className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-900 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-rose-950">
                            {item.clothType}
                          </h3>
                          <p className="text-xs text-rose-700 mt-0.5">
                            {item.bundlesCount}{" "}
                            {item.bundlesCount === 1 ? "Bundle" : "Bundles"} •{" "}
                            {item.totalPieces.toLocaleString("en-PK")} Pieces
                          </p>
                        </div>

                        <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-xs font-extrabold shrink-0">
                          {formatPKR(item.avgPerPiece, 2)} / pc
                        </span>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-rose-200/80 grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <div className="text-rose-700">Bundle Cost</div>
                          <div className="font-bold text-rose-950">
                            {formatPKR(item.totalBundlePrice)}
                          </div>
                        </div>
                        <div>
                          <div className="text-rose-700">Trans + Labour</div>
                          <div className="font-bold text-rose-950">
                            {formatPKR(item.totalTransport + item.totalLabour)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-rose-700">Landed Spend</div>
                          <div className="font-extrabold text-rose-800">
                            {formatPKR(item.totalLandedSpend)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ========================================================================
          MODALS
         ======================================================================== */}

      {/* 1. ADD / EDIT SALE MODAL */}
      {activeModal === "SALE" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-600 text-white">
              <h2 className="font-bold text-base flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5" />
                {editingTx
                  ? editingTx.tx_type === "CAPITAL"
                    ? "Edit Opening Capital"
                    : "Edit Cash Sale"
                  : "Record Cash Sale"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-emerald-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSale} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Cash Received (PKR)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    required
                    placeholder="e.g. 18500"
                    value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  required
                  value={saleCategory}
                  onChange={(e) => setSaleCategory(e.target.value)}
                  placeholder="Daily Cash Sales"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="e.g. Morning counter sales"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md disabled:opacity-60"
              >
                {submitting
                  ? "Saving..."
                  : editingTx
                  ? "Update Entry"
                  : "Save Cash Sale"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. ADD / EDIT BUNDLE PURCHASE MODAL (LANDED COSTING) */}
      {activeModal === "PURCHASE" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 bg-rose-600 text-white">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Package className="w-5 h-5" />
                {editingTx
                  ? "Edit Bundle Purchase"
                  : "Buy Cloth Bundle (Landed Cost)"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-rose-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Number of Pieces
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    required
                    placeholder="e.g. 120"
                    value={piecesCount}
                    onChange={(e) => setPiecesCount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Cloth Type
                </label>
                <select
                  value={clothType}
                  onChange={(e) => setClothType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  {CLOTH_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  1 Bundle Price (PKR)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  required
                  placeholder="e.g. 28000"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-rose-800 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Transportation (PKR)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={transportCost}
                    onChange={(e) => setTransportCost(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Labour / Loading (PKR)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={labourCost}
                    onChange={(e) => setLabourCost(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Supplier / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  placeholder="e.g. Shershah market grade-A"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {/* Live Landed Cost Preview */}
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-rose-800">
                  <span className="font-semibold">Total Bundle Outflow</span>
                  <span className="font-extrabold text-sm text-rose-900">
                    -{formatPKR(bundlePreview.totalOutflow)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-rose-200">
                  <span className="text-xs font-bold text-rose-900 flex items-center gap-1">
                    <Calculator className="w-4 h-4 text-rose-600" />
                    Calculated Per-Piece Cost
                  </span>
                  <span className="px-3 py-1 rounded-full bg-rose-600 text-white text-sm font-extrabold">
                    {formatPKR(bundlePreview.perPiece, 2)} / pc
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md disabled:opacity-60"
              >
                {submitting
                  ? "Saving..."
                  : editingTx
                  ? "Update Bundle Purchase"
                  : "Save Bundle Purchase"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD / EDIT EXPENSE MODAL */}
      {activeModal === "EXPENSE" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 bg-rose-800 text-white">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                {editingTx ? "Edit Shop Expense" : "Record Shop Expense"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-rose-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Amount Paid (PKR)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    required
                    placeholder="e.g. 2500"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-rose-800 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Expense Account
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setExpenseCategory(nextName);
                    if (!editingTx) {
                      const found = expenseAccounts.find(
                        (a) => a.name === nextName
                      );
                      if (found && Number(found.default_amount) > 0) {
                        setExpenseAmount(String(found.default_amount));
                      }
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  {expenseAccounts.map((acc) => (
                    <option key={acc.name} value={acc.name}>
                      {acc.name}
                      {Number(acc.default_amount) > 0
                        ? ` (${formatPKR(acc.default_amount)})`
                        : ""}
                    </option>
                  ))}
                  {!expenseAccounts.some((a) => a.name === expenseCategory) && (
                    <option value={expenseCategory}>{expenseCategory}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  placeholder="e.g. November shop rent"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-rose-800 hover:bg-rose-900 text-white font-bold text-sm shadow-md disabled:opacity-60"
              >
                {submitting
                  ? "Saving..."
                  : editingTx
                  ? "Update Expense"
                  : "Save Shop Expense"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. ADD / EDIT CAPITAL MODAL (ADMIN ONLY) */}
      {activeModal === "CAPITAL" && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 bg-indigo-600 text-white">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                {editingTx ? "Edit Capital Entry" : "Add Capital"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-indigo-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCapital} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={capitalDate}
                    onChange={(e) => setCapitalDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Amount (PKR)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    required
                    placeholder="e.g. 50000"
                    value={capitalAmount}
                    onChange={(e) => setCapitalAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-indigo-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Capital Source
                </label>
                <input
                  type="text"
                  required
                  value={capitalSource}
                  onChange={(e) => setCapitalSource(e.target.value)}
                  placeholder="Additional Capital"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  value={capitalNotes}
                  onChange={(e) => setCapitalNotes(e.target.value)}
                  placeholder="e.g. Owner cash top-up for winter stock"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md disabled:opacity-60"
              >
                {submitting
                  ? "Saving..."
                  : editingTx
                  ? "Update Capital Entry"
                  : "Save Capital"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. ADD EXPENSE ACCOUNT MODAL (ADMIN ONLY) */}
      {activeModal === "ACCOUNT" && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white">
              <h2 className="font-bold text-base flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                Add Custom Expense Account
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpenseAccount} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Market Watchman Fee"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Default Amount in PKR (Optional)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={newAccountDefault}
                  onChange={(e) => setNewAccountDefault(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md disabled:opacity-60"
              >
                {submitting ? "Adding..." : "Create Expense Account"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. RESET DATA CONFIRMATION MODAL (ADMIN ONLY) */}
      {activeModal === "RESET" && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Reset All Ledger Data?
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                This will permanently delete all sales, bundle purchases, and
                expenses, and restore the starting{" "}
                <span className="font-bold text-slate-900">400,000 PKR</span>{" "}
                Opening Capital.
              </p>

              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleResetData}
                  className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-60"
                >
                  {submitting ? "Resetting..." : "Yes, Reset Data"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
