"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BarChart3, FileSpreadsheet, TrendingUp, ReceiptText, Banknote, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"

type InvoiceSummary = {
  totalCount: number
  totalAmount: number
  totalPaid: number
  totalDue: number
}

export default function ProjectDashboardPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<InvoiceSummary>({ totalCount: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 })
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadInvoices() {
      setLoading(true)
      setLoadError(null)
      try {
        const ts = Date.now()
        const res = await fetch(`/api/admin/invoices?t=${ts}&summaryOnly=true`, {
          cache: "no-store",
          credentials: "include",
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load invoice summary")
        }
        if (cancelled) return
        setSummary({
          totalCount: Number(data?.summary?.totalCount || 0),
          totalAmount: Number(data?.summary?.totalAmount || 0),
          totalPaid: Number(data?.summary?.totalPaid || 0),
          totalDue: Number(data?.summary?.totalDue || 0),
        })
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load invoice summary.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadInvoices()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Dashboard</h1>
        <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
          Independent project finance workspace outside the admin dashboard route.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">{loadError}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500/15 text-slate-700 dark:text-slate-300">
                <ReceiptText className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Total invoices</CardTitle>
            </div>
            <CardDescription>Saved project invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{loading ? "..." : summary.totalCount}</p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Banknote className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Invoice total amount</CardTitle>
            </div>
            <CardDescription>Sum of all saved invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{loading ? "..." : formatPrice(summary.totalAmount)}</p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Payment made (paid)</CardTitle>
            </div>
            <CardDescription>Paid amount from invoice payments</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{loading ? "..." : formatPrice(summary.totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Total due</CardTitle>
            </div>
            <CardDescription>Remaining amount on saved invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{loading ? "..." : formatPrice(summary.totalDue)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Overview</CardTitle>
            </div>
            <CardDescription>High-level project money in and out</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Add KPIs and charts when data sources are connected.</p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Line items</CardTitle>
            </div>
            <CardDescription>Detailed breakdown by category</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Map orders, fees, and supplier payouts to projects.</p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <BarChart3 className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Reports</CardTitle>
            </div>
            <CardDescription>Export and period comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Scheduled exports and PDF summaries can live here.</p>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
        <CardHeader>
          <CardTitle className="text-lg">Invoice</CardTitle>
          <CardDescription>Create project invoices from this standalone dashboard.</CardDescription>
        </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="bg-[#1e5bb8] text-white hover:bg-[#1a4fa3] hover:text-white">
              <Link href="/PROJECTDASHBOARD/invoice">Open Invoice</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/PROJECTDASHBOARD/invoices/list">View Invoice Clients</Link>
            </Button>
          </CardContent>
      </Card>
    </div>
  )
}
