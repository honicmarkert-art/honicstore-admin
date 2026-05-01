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
  total_paid?: number
  total_due?: number
  created_at: string
  hiddenFromList?: boolean
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

export default function InvoiceClientsListPage({
  dashboardScope = "main",
  studioBasePath = "/dashboard/invoices",
  listBasePath = "/dashboard/invoices/list",
}: {
  dashboardScope?: "main" | "project"
  studioBasePath?: string
  listBasePath?: string
}) {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const [query, setQuery] = useState("")
  const [invoices, setInvoices] = useState<SavedInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hidingId, setHidingId] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
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
        const sourceScope = dashboardScope === "project" ? "project" : "main"
        const qs = query.trim()
          ? `?clientName=${encodeURIComponent(query.trim())}&limit=200&scope=${sourceScope}`
          : `?limit=200&scope=${sourceScope}`
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
  }, [query, reloadTick, dashboardScope])

  const deleteInvoice = async (invoiceId: string, invoiceNumber: string) => {
    const ok = window.confirm(`Delete invoice ${invoiceNumber || invoiceId}? This cannot be undone.`)
    if (!ok) return
    setDeletingId(invoiceId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete invoice")
      }
      setReloadTick((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete invoice.")
    } finally {
      setDeletingId(null)
    }
  }

  const hideInvoiceFromList = async (invoiceId: string, checked: boolean) => {
    setHidingId(invoiceId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hiddenFromList: checked }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to hide invoice")
      }
      const current = invoices.find((inv) => inv.id === invoiceId)
      setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, hiddenFromList: checked } : inv)))
      if (current) {
        const amount = Number(current.grand_total || 0)
        const paid = Number(current.total_paid || 0)
        const due = Number(current.total_due || Math.max(0, amount - paid))
        const delta = checked ? -1 : 1
        setSummary((prev) => ({
          totalCount: Math.max(0, prev.totalCount + delta),
          totalAmount: Math.max(0, prev.totalAmount + delta * amount),
          totalPaid: Math.max(0, prev.totalPaid + delta * paid),
          totalDue: Math.max(0, prev.totalDue + delta * due),
        }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to hide invoice.")
    } finally {
      setHidingId(null)
    }
  }

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
          <Link href={studioBasePath}>Back to Invoice Studio</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
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
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className={cn("border-b", inv.hiddenFromList && "bg-muted/40 opacity-60")}>
                      <td className="px-3 py-2 font-medium">{inv.invoice_number || "—"}</td>
                      <td className="px-3 py-2">{inv.client_name}</td>
                      <td className="px-3 py-2">{fmtDate(inv.issue_date)}</td>
                      <td className="px-3 py-2">{fmtDate(inv.due_date)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(Number(inv.grand_total || 0))}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(Number(inv.total_paid || 0))}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={Boolean(inv.hiddenFromList)}
                              disabled={hidingId === inv.id}
                              onChange={(e) => hideInvoiceFromList(inv.id, e.target.checked)}
                            />
                            {hidingId === inv.id ? "Saving..." : "Hide"}
                          </label>
                          {inv.hiddenFromList ? (
                            <>
                              <Button size="sm" variant="outline" disabled>Preview</Button>
                              <Button size="sm" variant="outline" disabled>Edit</Button>
                              <Button size="sm" disabled>Payments</Button>
                            </>
                          ) : (
                            <>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`${studioBasePath}?invoiceId=${inv.id}&mode=preview`}>Preview</Link>
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`${studioBasePath}?invoiceId=${inv.id}&mode=edit`}>Edit</Link>
                              </Button>
                              <Button asChild size="sm">
                                <Link href={`${listBasePath}/${inv.id}?scope=${dashboardScope}`}>Payments</Link>
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deletingId === inv.id || Boolean(inv.hiddenFromList)}
                            onClick={() => deleteInvoice(inv.id, inv.invoice_number)}
                          >
                            {deletingId === inv.id ? "Deleting..." : "Delete"}
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
