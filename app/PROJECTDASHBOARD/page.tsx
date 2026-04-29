"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"

type Row = {
  id: string
  invoice_number: string
  client_name: string
  created_at?: string | null
  service_price: number
  total_price: number
  total_paid: number
  total_due: number
}

export default function ProjectDashboardPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const [rows, setRows] = useState<Row[]>([])
  const [totalInvoices, setTotalInvoices] = useState(0)
  const [summary, setSummary] = useState({
    totalItemProductPrice: 0,
    totalServicePrice: 0,
    totalPrice: 0,
    totalPaid: 0,
    totalDue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const kpiTitleClass = "truncate whitespace-nowrap text-[11px] font-semibold leading-none sm:text-xs"
  const kpiValueClass = "truncate whitespace-nowrap text-lg font-bold leading-tight sm:text-xl"
  const totalOutstanding = Math.max(0, summary.totalDue)
  const collectionRate = summary.totalPrice > 0 ? (summary.totalPaid / summary.totalPrice) * 100 : 0
  const dueRate = summary.totalPrice > 0 ? (summary.totalDue / summary.totalPrice) * 100 : 0
  const productShare = summary.totalPrice > 0 ? (summary.totalItemProductPrice / summary.totalPrice) * 100 : 0
  const serviceShare = summary.totalPrice > 0 ? (summary.totalServicePrice / summary.totalPrice) * 100 : 0
  const activeClients = new Set(rows.map((r) => String(r.client_name || "").trim()).filter(Boolean)).size
  const avgInvoiceValue = totalInvoices > 0 ? summary.totalPrice / totalInvoices : 0
  const avgDuePerInvoice = totalInvoices > 0 ? summary.totalDue / totalInvoices : 0
  const cashHealthLabel = collectionRate >= 75 ? "Healthy" : collectionRate >= 50 ? "Watch" : "Risk"
  const cashHealthClass =
    cashHealthLabel === "Healthy"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : cashHealthLabel === "Watch"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-red-500/15 text-red-700 dark:text-red-300"

  const monthlySeries = (() => {
    const bucket = new Map<string, { total: number; paid: number; due: number }>()
    for (const r of rows) {
      const d = r.created_at ? new Date(r.created_at) : null
      const key =
        d && !Number.isNaN(d.getTime())
          ? d.toLocaleString("en-US", { month: "short", year: "2-digit" })
          : "Unknown"
      const current = bucket.get(key) || { total: 0, paid: 0, due: 0 }
      current.total += Number(r.total_price || 0) + Number(r.service_price || 0)
      current.paid += Number(r.total_paid || 0)
      current.due += Number(r.total_due || 0)
      bucket.set(key, current)
    }
    return Array.from(bucket.entries())
      .map(([label, value]) => ({ label, ...value }))
      .slice(-6)
  })()

  const trendPath = (() => {
    if (monthlySeries.length < 2) return ""
    const values = monthlySeries.map((m) => m.total)
    const max = Math.max(...values, 1)
    return monthlySeries
      .map((m, i) => {
        const x = (i / (monthlySeries.length - 1)) * 100
        const y = 100 - (m.total / max) * 100
        return `${i === 0 ? "M" : "L"} ${x},${y}`
      })
      .join(" ")
  })()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const ts = Date.now()
        const res = await fetch(`/api/admin/invoices/service-costs?t=${ts}`, { cache: "no-store", credentials: "include" })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load summary")
        if (cancelled) return
        setRows(Array.isArray(data.rows) ? data.rows : [])
        setTotalInvoices(Number(data.totalCount || 0))
        setSummary({
          totalItemProductPrice: Number(data.summary?.totalItemProductPrice || 0),
          totalServicePrice: Number(data.summary?.totalServicePrice || 0),
          totalPrice: Number(data.summary?.totalPrice || 0),
          totalPaid: Number(data.summary?.totalPaid || 0),
          totalDue: Number(data.summary?.totalDue || 0),
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load summary.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Items + Product Remaining Summary</h1>
        <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
          Client summary of item/product totals, service price, paid, and due balances.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm md:col-span-2")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Portfolio Position</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>Outstanding receivable</p>
              <p className="text-2xl font-bold">{formatPrice(totalOutstanding)}</p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", cashHealthClass)}>{cashHealthLabel} cash flow</span>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avg invoice value</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatPrice(avgInvoiceValue)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active clients</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{loading ? "..." : activeClients}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className={kpiTitleClass}>Total invoices</CardTitle>
          </CardHeader>
          <CardContent className={cn(kpiValueClass, "min-w-0")}>{loading ? "..." : totalInvoices}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className={kpiTitleClass}>Total item + product price</CardTitle>
          </CardHeader>
          <CardContent className={cn(kpiValueClass, "min-w-0")}>{formatPrice(summary.totalItemProductPrice)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className={kpiTitleClass}>Total service price</CardTitle>
          </CardHeader>
          <CardContent className={cn(kpiValueClass, "min-w-0")}>{formatPrice(summary.totalServicePrice)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className={kpiTitleClass}>Combined total price</CardTitle>
          </CardHeader>
          <CardContent className={cn(kpiValueClass, "min-w-0")}>{formatPrice(summary.totalPrice)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className={kpiTitleClass}>Paid</CardTitle>
          </CardHeader>
          <CardContent className={cn(kpiValueClass, "min-w-0")}>{formatPrice(summary.totalPaid)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className={kpiTitleClass}>Due</CardTitle>
          </CardHeader>
          <CardContent className={cn(kpiValueClass, "min-w-0")}>{formatPrice(summary.totalDue)}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm xl:col-span-2")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Financial Trend (Last Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlySeries.length < 2 ? (
              <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Need more invoice records for trend visualization.</p>
            ) : (
              <div className="space-y-3">
                <div className="h-44 w-full rounded-xl border bg-muted/20 p-3">
                  <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-label="Revenue trend line">
                    <defs>
                      <linearGradient id="trendLine" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.35" />
                      </linearGradient>
                    </defs>
                    <path d="M 0,100 L 100,100" stroke="rgba(148,163,184,0.35)" strokeWidth="0.8" fill="none" />
                    <path d={trendPath} stroke="url(#trendLine)" strokeWidth="2.2" fill="none" />
                  </svg>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {monthlySeries.map((m) => (
                    <div key={m.label} className="rounded-lg border bg-muted/15 p-2">
                      <p className={cn("font-semibold", themeClasses.textNeutralSecondary)}>{m.label}</p>
                      <p className="font-semibold">{formatPrice(m.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Finance Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Collection Rate</span>
                <span className="font-semibold">{collectionRate.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, collectionRate)}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Due Exposure</span>
                <span className="font-semibold">{dueRate.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, dueRate)}%` }} />
              </div>
            </div>
            <div className="space-y-1 rounded-xl border bg-muted/15 p-3 text-sm">
              <p className="font-semibold">Revenue Composition</p>
              <p>Item + Product: {productShare.toFixed(1)}%</p>
              <p>Service: {serviceShare.toFixed(1)}%</p>
              <p className="pt-1 font-semibold">Outstanding: {formatPrice(totalOutstanding)}</p>
              <p>Avg due / invoice: {formatPrice(avgDuePerInvoice)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl")}>
        <CardContent className="pt-6">
          {loading ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading summary table...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No project invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left font-semibold">Invoice #</th>
                    <th className="px-3 py-2 text-left font-semibold">Client name</th>
                    <th className="px-3 py-2 text-right font-semibold">Item + product price</th>
                    <th className="px-3 py-2 text-right font-semibold">Service price</th>
                    <th className="px-3 py-2 text-right font-semibold">Total amount</th>
                    <th className="px-3 py-2 text-right font-semibold">Paid</th>
                    <th className="px-3 py-2 text-right font-semibold">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b odd:bg-transparent even:bg-muted/10">
                      <td className="px-3 py-2">{r.invoice_number || "—"}</td>
                      <td className="px-3 py-2">{r.client_name || "—"}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.total_price)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.service_price)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.total_price + r.service_price)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.total_paid)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.total_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
