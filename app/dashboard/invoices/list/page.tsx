"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"

type SavedInvoice = {
  id: string
  invoice_number: string
  client_name: string
  issue_date: string | null
  due_date: string | null
  currency: string
  grand_total: number
  created_at: string
}

type InvoiceResponse = {
  success: boolean
  invoices: SavedInvoice[]
  summary?: {
    totalCount: number
    totalAmount: number
    totalPaid?: number
    totalDue?: number
  }
}

function fmtDate(v: string | null): string {
  if (!v) return "—"
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString("en-GB")
}

export default function InvoiceClientsListPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const [query, setQuery] = useState("")
  const [invoices, setInvoices] = useState<SavedInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ totalCount: number; totalAmount: number; totalPaid: number; totalDue: number }>({
    totalCount: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalDue: 0,
  })

  useEffect(() => {
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const qs = query.trim() ? `?clientName=${encodeURIComponent(query.trim())}&limit=200` : "?limit=200"
        const res = await fetch(`/api/admin/invoices${qs}`, {
          cache: "no-store",
          credentials: "include",
          signal: ctrl.signal,
        })
        const data: InvoiceResponse = await res.json()
        if (!res.ok || !data.success) {
          throw new Error("Failed to load invoices list")
        }
        setInvoices(Array.isArray(data.invoices) ? data.invoices : [])
        setSummary({
          totalCount: Number(data.summary?.totalCount || 0),
          totalAmount: Number(data.summary?.totalAmount || 0),
          totalPaid: Number(data.summary?.totalPaid || 0),
          totalDue: Number(data.summary?.totalDue || 0),
        })
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Failed to load invoices.")
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [query])

  const clientCount = useMemo(() => new Set(invoices.map((i) => i.client_name)).size, [invoices])

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Invoices</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            View invoices by client name and total amounts.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/invoices">Back to Invoice Studio</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total invoices</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.totalCount}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total invoice amount</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatPrice(summary.totalAmount)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clients in view</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{clientCount}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Payment made (paid)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatPrice(summary.totalPaid)}</CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total due</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatPrice(summary.totalDue)}</CardContent>
        </Card>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader>
          <CardTitle className="text-base">Filter by client</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type client name..."
          />
        </CardContent>
      </Card>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardContent className="pt-6">
          {loading ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading invoices...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : invoices.length === 0 ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left">Invoice #</th>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-left">Issue</th>
                    <th className="px-3 py-2 text-left">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Saved</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b">
                      <td className="px-3 py-2 font-medium">{inv.invoice_number || "—"}</td>
                      <td className="px-3 py-2">{inv.client_name}</td>
                      <td className="px-3 py-2">{fmtDate(inv.issue_date)}</td>
                      <td className="px-3 py-2">{fmtDate(inv.due_date)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(Number(inv.grand_total || 0))}</td>
                      <td className="px-3 py-2">{fmtDate(inv.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/invoices?invoiceId=${inv.id}&mode=preview`}>Preview</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/invoices?invoiceId=${inv.id}&mode=edit`}>Edit</Link>
                          </Button>
                          <Button asChild size="sm">
                            <Link href={`/dashboard/invoices/list/${inv.id}?tab=payments`}>Payments</Link>
                          </Button>
                        </div>
                      </td>
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
