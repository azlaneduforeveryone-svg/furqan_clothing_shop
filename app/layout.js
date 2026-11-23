import "./globals.css";

export const metadata = {
  title: "Furqan Used Cloth Business | Cash-Basis Ledger",
  description:
    "Mobile-first cash-basis accounting, bundle landed costing, and reporting for Furqan Used Cloth Business.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
