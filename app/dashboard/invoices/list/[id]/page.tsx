"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, usePathname, useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"

type PaymentRecord = { id: string; date: string; amount: number; note?: string }
type InvoiceRow = {
  id: string
  invoice_number: string
  client_name: string
  issue_date: string | null
  due_date: string | null
  currency: string
  grand_total: number
  payload?: any
}

function parseAmount(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function getSectionSubtotal(section: any): number {
  const cols = Array.isArray(section?.columns) ? section.columns : []
  const rows = Array.isArray(section?.rows) ? section.rows : []
  const totalKey =
    cols.find((c: any) => /total/i.test(c?.key))?.key ??
    cols.find((c: any) => /amount/i.test(c?.key))?.key ??
    cols[cols.length - 1]?.key
  if (!totalKey) return 0
  return rows.reduce((sum: number, row: any) => sum + parseAmount(row?.[totalKey]), 0)
}

export default function SavedInvoiceDetailPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") || "payments"
  const scope = pathname.startsWith("/PROJECTDASHBOARD") || searchParams.get("scope") === "project" ? "project" : "main"
  const listBasePath = scope === "project" ? "/PROJECTDASHBOARD/invoices/list" : "/dashboard/invoices/list"
  const studioBasePath = scope === "project" ? "/PROJECTDASHBOARD/invoice" : "/dashboard/invoices"
  const INVOICE_BLUE = "#184a96"
  const id = params.id

  const [invoice, setInvoice] = useState<InvoiceRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [clientName, setClientName] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [grandTotal, setGrandTotal] = useState<number>(0)
  const [paymentNote, setPaymentNote] = useState("")

  const [paymentDate, setPaymentDate] = useState("")
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentEntryNote, setPaymentEntryNote] = useState("")

  useEffect(() => {
    if (!id) return
    if (tab === "preview") {
      router.replace(`${studioBasePath}?invoiceId=${id}&mode=preview`)
      return
    }
    if (tab === "edit") {
      router.replace(`${studioBasePath}?invoiceId=${id}&mode=edit`)
      return
    }
  }, [id, tab, router, studioBasePath])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/invoices/${id}`, { cache: "no-store", credentials: "include" })
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data?.error || "Failed to load invoice")
        if (cancelled) return
        const inv = data.invoice as InvoiceRow
        setInvoice(inv)
        setInvoiceNumber(inv.invoice_number || "")
        setClientName(inv.client_name || "")
        setIssueDate(inv.issue_date || "")
        setDueDate(inv.due_date || "")
        setGrandTotal(Number(inv.grand_total || 0))
        setPaymentNote(inv.payload?.payments?.note || "")
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load invoice")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (id) load()
    return () => {
      cancelled = true
    }
  }, [id])

  const paymentRecords: PaymentRecord[] = useMemo(() => {
    const rec = invoice?.payload?.payments?.records
    return Array.isArray(rec) ? rec : []
  }, [invoice])
  const paidTotal = useMemo(() => paymentRecords.reduce((s, p) => s + Number(p.amount || 0), 0), [paymentRecords])
  const previewPaidTotal = paidTotal + Math.max(0, paymentAmount || 0)
  const dueAmount = Math.max(0, grandTotal - paidTotal)
  const dueAmountPreview = Math.max(0, grandTotal - previewPaidTotal)
  const scheduleRows = useMemo(() => {
    const sections = invoice?.payload?.projectTables?.sections || []
    const raw = invoice?.payload?.projectTables?.paymentSchedule || []
    const material = (sections[0] ? getSectionSubtotal(sections[0]) : 0) + (sections[1] ? getSectionSubtotal(sections[1]) : 0)
    const service = sections[2] ? getSectionSubtotal(sections[2]) : 0
    const amountToPay = [material / 2, material / 2, service / 2, service / 2]

    const allocate = (totalPaid: number) => {
      let remaining = totalPaid
      return amountToPay.map((a) => {
        const paid = Math.max(0, Math.min(a, remaining))
        remaining = Math.max(0, remaining - paid)
        return { scheduled: a, paid, due: Math.max(0, a - paid) }
      })
    }
    const allocSaved = allocate(paidTotal)
    const allocPreview = allocate(previewPaidTotal)
    return amountToPay.map((a, i) => ({
      phase: String(i + 1),
      deadline: raw[i]?.deadline || "",
      scheduled: a,
      paid: allocSaved[i]?.paid || 0,
      due: allocSaved[i]?.due || 0,
      paidPreview: allocPreview[i]?.paid || 0,
      duePreview: allocPreview[i]?.due || 0,
    }))
  }, [invoice, paidTotal, previewPaidTotal])
  const scheduleTotalDue = useMemo(() => scheduleRows.reduce((s, r) => s + r.due, 0), [scheduleRows])
  const scheduleTotalDuePreview = useMemo(() => scheduleRows.reduce((s, r) => s + r.duePreview, 0), [scheduleRows])

  const refreshInvoice = async () => {
    const res = await fetch(`/api/admin/invoices/${id}`, { cache: "no-store", credentials: "include" })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data?.error || "Failed to refresh invoice")
    const inv = data.invoice as InvoiceRow
    setInvoice(inv)
    setGrandTotal(Number(inv.grand_total || 0))
    setPaymentNote(inv.payload?.payments?.note || "")
  }

  const saveEdit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceNumber,
          clientName,
          issueDate,
          dueDate,
          grandTotal,
          paymentNote,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data?.error || "Failed to save invoice")
      await refreshInvoice()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const addPaymentRecord = async () => {
    if (!paymentDate || paymentAmount <= 0) {
      setError("Payment date and amount are required.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          paymentNote,
          paymentEntry: {
            date: paymentDate,
            amount: paymentAmount,
            note: paymentEntryNote,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data?.error || "Failed to add payment")
      setPaymentDate("")
      setPaymentAmount(0)
      setPaymentEntryNote("")
      await refreshInvoice()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add payment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>Record payments made and track due balance.</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`${listBasePath}?scope=${scope}`}>Back to list</Link>
        </Button>
      </div>

      {loading ? <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && invoice ? (
        <Card className={cn("mx-auto w-full max-w-4xl", themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader>
            <CardTitle className="text-slate-900">Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-md border px-3 py-2" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Invoice total</p>
                <p className="text-base font-bold text-slate-900">{formatPrice(grandTotal)}</p>
              </div>
              <div className="rounded-md border px-3 py-2" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Paid</p>
                <p className="text-base font-bold text-slate-900">{formatPrice(paidTotal)}</p>
              </div>
              <div className="rounded-md border px-3 py-2" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Due</p>
                <p className="text-base font-bold text-slate-900">{formatPrice(dueAmount)}</p>
              </div>
            </div>
            <Textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Payment notes / terms" />
            <div className="grid gap-2 md:grid-cols-3">
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <Input type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)} placeholder="Amount received from client" />
              <Input value={paymentEntryNote} onChange={(e) => setPaymentEntryNote(e.target.value)} placeholder="Payment note" />
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-semibold">Payment Schedule (auto marking by amount entered)</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr style={{ background: INVOICE_BLUE }}>
                      <th className="px-2 py-1 text-left text-white">Phase</th>
                      <th className="px-2 py-1 text-left text-white">Deadline</th>
                      <th className="px-2 py-1 text-right text-white">Scheduled</th>
                      <th className="px-2 py-1 text-right text-white">Paid</th>
                      <th className="px-2 py-1 text-right text-white">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((r) => (
                      <tr key={r.phase} className="border-b odd:bg-white even:bg-blue-50/50">
                        <td className="px-2 py-1">{r.phase}</td>
                        <td className="px-2 py-1">{r.deadline || "—"}</td>
                        <td className="px-2 py-1 text-right">{formatPrice(r.scheduled)}</td>
                        <td className="px-2 py-1 text-right">
                          {formatPrice(paymentAmount > 0 ? r.paidPreview : r.paid)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {formatPrice(paymentAmount > 0 ? r.duePreview : r.due)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addPaymentRecord} disabled={saving}>{saving ? "Saving..." : "Add Payment Record"}</Button>
              <Button variant="outline" onClick={saveEdit} disabled={saving}>Save Notes</Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <p className="rounded-md border px-3 py-2" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                <strong>Total due in schedule:</strong> {formatPrice(scheduleTotalDue)}
              </p>
              {paymentAmount > 0 ? (
                <p className="rounded-md border px-3 py-2" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                  <strong>Total due after entered amount:</strong> {formatPrice(scheduleTotalDuePreview)}
                </p>
              ) : (
                <p className="rounded-md border px-3 py-2" style={{ borderColor: "#dbeafe", background: "#eff6ff" }}>
                  <strong>Total due card:</strong> {formatPrice(dueAmount)}
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr style={{ background: INVOICE_BLUE }}>
                    <th className="px-2 py-1 text-left text-white">Date</th>
                    <th className="px-2 py-1 text-right text-white">Amount</th>
                    <th className="px-2 py-1 text-left text-white">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRecords.length === 0 ? (
                    <tr><td className="px-2 py-2 text-muted-foreground" colSpan={3}>No payment records yet.</td></tr>
                  ) : (
                    paymentRecords.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="px-2 py-1">{p.date}</td>
                        <td className="px-2 py-1 text-right">{formatPrice(Number(p.amount || 0))}</td>
                        <td className="px-2 py-1">{p.note || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

