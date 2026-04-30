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
        const res = await fetch(`/api/admin/invoices/service-costs?t=${Date.now()}`, { cache: "no-store", credentials: "include" })
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
          General summary and financial view for project invoices.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm md:col-span-2")}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Portfolio Position</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>Outstanding receivable</p>
              <p className="text-2xl font-bold">{formatPrice(totalOutstanding)}</p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", cashHealthClass)}>{cashHealthLabel} cash flow</span>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="pb-2"><CardTitle className="text-sm">Avg invoice value</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatPrice(avgInvoiceValue)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="pb-2"><CardTitle className="text-sm">Active clients</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{loading ? "..." : activeClients}</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="space-y-0 pb-2"><CardTitle className="text-xs font-semibold">Total invoices</CardTitle></CardHeader><CardContent className="text-xl font-bold">{loading ? "..." : totalInvoices}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="space-y-0 pb-2"><CardTitle className="text-xs font-semibold">Total item + product price</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatPrice(summary.totalItemProductPrice)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="space-y-0 pb-2"><CardTitle className="text-xs font-semibold">Total service price</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatPrice(summary.totalServicePrice)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="space-y-0 pb-2"><CardTitle className="text-xs font-semibold">Combined total price</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatPrice(summary.totalPrice)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="space-y-0 pb-2"><CardTitle className="text-xs font-semibold">Paid</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatPrice(summary.totalPaid)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}><CardHeader className="space-y-0 pb-2"><CardTitle className="text-xs font-semibold">Due</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatPrice(summary.totalDue)}</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm xl:col-span-2")}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Financial Trend (Last Months)</CardTitle></CardHeader>
          <CardContent>
            {monthlySeries.length < 2 ? (
              <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Need more invoice records for trend visualization.</p>
            ) : (
              <div className="space-y-3">
                <div className="h-44 w-full rounded-xl border bg-muted/20 p-3">
                  <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-label="Revenue trend line">
                    <path d="M 0,100 L 100,100" stroke="rgba(148,163,184,0.35)" strokeWidth="0.8" fill="none" />
                    <path d={trendPath} stroke="#3b82f6" strokeWidth="2.2" fill="none" />
                  </svg>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder, "rounded-2xl shadow-sm")}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Finance Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Collection Rate:</strong> {collectionRate.toFixed(1)}%</p>
            <p><strong>Due Exposure:</strong> {dueRate.toFixed(1)}%</p>
            <p><strong>Item + Product Share:</strong> {productShare.toFixed(1)}%</p>
            <p><strong>Service Share:</strong> {serviceShare.toFixed(1)}%</p>
            <p><strong>Avg due / invoice:</strong> {formatPrice(avgDuePerInvoice)}</p>
          </CardContent>
        </Card>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
