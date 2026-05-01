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

/** Split whole amount across two phases (floor/ceil) so the pair sums exactly. */
function splitIntoTwoPhases(total: number): [number, number] {
  const t = Math.max(0, Math.round(Number(total) || 0))
  const a = Math.floor(t / 2)
  const b = t - a
  return [a, b]
}

/**
 * Phases 1–2: half each of (invoice grand total − Service section total).
 * Phases 3–4: half each of Service section total (capped to grand total if needed).
 * No project tables: split grand total evenly across four phases.
 */
function buildPaymentPhaseScheduledAmounts(grandTotal: number, serviceSectionTotal: number, hasProjectTables: boolean): number[] {
  const gt = Math.max(0, Math.round(Number(grandTotal) || 0))
  if (!hasProjectTables) {
    if (gt > 0) {
      const q = Math.floor(gt / 4)
      const r = gt - q * 4
      return [q + (r > 0 ? 1 : 0), q + (r > 1 ? 1 : 0), q + (r > 2 ? 1 : 0), q]
    }
    return [0, 0, 0, 0]
  }
  const svcRaw = Math.max(0, Math.round(Number(serviceSectionTotal) || 0))
  const svcApplied = Math.min(svcRaw, gt)
  const materialRemainder = Math.max(0, gt - svcApplied)
  const [p1, p2] = splitIntoTwoPhases(materialRemainder)
  const [p3, p4] = splitIntoTwoPhases(svcApplied)
  return [p1, p2, p3, p4]
}

function sumSchedulePhases(
  rows: Array<{ scheduled: number; paid: number; due: number; paidPreview: number; duePreview: number }>,
  startIdx: number,
  endIdx: number,
  usePreview: boolean
) {
  let scheduled = 0
  let paid = 0
  let due = 0
  for (let i = startIdx; i <= endIdx && i < rows.length; i++) {
    const r = rows[i]!
    scheduled += r.scheduled
    if (usePreview) {
      paid += r.paidPreview
      due += r.duePreview
    } else {
      paid += r.paid
      due += r.due
    }
  }
  return { scheduled, paid, due }
}

export default function SavedInvoiceDetailPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") || "payments"
  const scope =
    pathname.startsWith("/projectdashboard") ||
    searchParams.get("scope") === "project"
      ? "project"
      : "main"
  const listBasePath = scope === "project" ? "/projectdashboard/invoices/list" : "/dashboard/invoices/list"
  const studioBasePath = scope === "project" ? "/projectdashboard/invoice" : "/dashboard/invoices"
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
  const paidTotal = useMemo(
    () => Math.round(paymentRecords.reduce((s, p) => s + Number(p.amount || 0), 0)),
    [paymentRecords]
  )
  const previewPaidTotal = paidTotal + Math.max(0, Math.round(Number(paymentAmount) || 0))
  const dueAmount = Math.max(0, grandTotal - paidTotal)
  const dueAmountPreview = Math.max(0, grandTotal - previewPaidTotal)

  const sectionTotals = useMemo(() => {
    const sections = invoice?.payload?.projectTables?.sections || []
    const material = (sections[0] ? getSectionSubtotal(sections[0]) : 0) + (sections[1] ? getSectionSubtotal(sections[1]) : 0)
    const service = sections[2] ? getSectionSubtotal(sections[2]) : 0
    return {
      material,
      service,
      materialRounded: Math.round(material),
      serviceRounded: Math.round(service),
      combinedRounded: Math.round(Math.max(0, material + service)),
      hasProjectSections: sections.length > 0,
    }
  }, [invoice])

  const scheduleRows = useMemo(() => {
    const raw = invoice?.payload?.projectTables?.paymentSchedule || []
    const amountToPay = buildPaymentPhaseScheduledAmounts(grandTotal, sectionTotals.service, sectionTotals.hasProjectSections)

    const allocate = (totalPaid: number) => {
      let remaining = Math.max(0, Math.round(Number(totalPaid) || 0))
      return amountToPay.map((a) => {
        const sched = Math.round(Number(a) || 0)
        const paid = Math.max(0, Math.min(sched, remaining))
        remaining = Math.max(0, remaining - paid)
        return { scheduled: sched, paid, due: Math.max(0, sched - paid) }
      })
    }
    const allocSaved = allocate(paidTotal)
    const allocPreview = allocate(previewPaidTotal)
    return amountToPay.map((a, i) => ({
      phase: String(i + 1),
      deadline: raw[i]?.deadline || "",
      scheduled: allocSaved[i]?.scheduled ?? Math.round(Number(a) || 0),
      paid: allocSaved[i]?.paid || 0,
      due: allocSaved[i]?.due || 0,
      paidPreview: allocPreview[i]?.paid || 0,
      duePreview: allocPreview[i]?.due || 0,
    }))
  }, [invoice, sectionTotals.service, sectionTotals.hasProjectSections, grandTotal, paidTotal, previewPaidTotal])
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

  const deletePaymentRecord = async (recordId: string) => {
    const ok = window.confirm("Delete this payment record?")
    if (!ok) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          removePaymentRecordId: recordId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data?.error || "Failed to delete payment")
      await refreshInvoice()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete payment")
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
              <p className={cn("mb-2 text-xs leading-relaxed", themeClasses.textNeutralSecondary)}>
                {sectionTotals.hasProjectSections ? (
                  <>
                    <strong>Scheduled:</strong> Phases <strong>1–2</strong> each use half of{" "}
                    <strong>(invoice total − Service section)</strong>:{" "}
                    <strong className="text-slate-800">{formatPrice(Math.round(grandTotal || 0))}</strong> −{" "}
                    <strong className="text-slate-800">{formatPrice(Math.min(sectionTotals.serviceRounded, Math.round(grandTotal || 0)))}</strong> service → remainder split across phases 1 and 2.
                    Phases <strong>3–4</strong> each use half of the Service section (
                    <strong className="text-slate-800">{formatPrice(sectionTotals.serviceRounded)}</strong>
                    ). Electrical + Prototype table totals{" "}
                    <strong className="text-slate-800">{formatPrice(sectionTotals.materialRounded)}</strong> are informational only here.
                  </>
                ) : (
                  <>
                    <strong>Scheduled:</strong> Invoice total split evenly across four phases (no project tables on this invoice).
                  </>
                )}{" "}
                <strong>Paid</strong> fills phases <strong>1 → 2 → 3 → 4</strong> in order.
              </p>
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
                    {scheduleRows.length > 0 ? (
                      <>
                        {(() => {
                          const preview = paymentAmount > 0
                          const mat = sumSchedulePhases(scheduleRows, 0, 1, preview)
                          const svc = sumSchedulePhases(scheduleRows, 2, 3, preview)
                          return (
                            <>
                              <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                                <td className="px-2 py-2" colSpan={2}>
                                  Material subtotal (phases 1–2)
                                </td>
                                <td className="px-2 py-2 text-right">{formatPrice(mat.scheduled)}</td>
                                <td className="px-2 py-2 text-right">{formatPrice(mat.paid)}</td>
                                <td className="px-2 py-2 text-right">{formatPrice(mat.due)}</td>
                              </tr>
                              <tr className="border-b bg-slate-100 font-semibold text-slate-900">
                                <td className="px-2 py-2" colSpan={2}>
                                  Service subtotal (phases 3–4)
                                </td>
                                <td className="px-2 py-2 text-right">{formatPrice(svc.scheduled)}</td>
                                <td className="px-2 py-2 text-right">{formatPrice(svc.paid)}</td>
                                <td className="px-2 py-2 text-right">{formatPrice(svc.due)}</td>
                              </tr>
                            </>
                          )
                        })()}
                      </>
                    ) : null}
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
                    <th className="px-2 py-1 text-right text-white">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRecords.length === 0 ? (
                    <tr><td className="px-2 py-2 text-muted-foreground" colSpan={4}>No payment records yet.</td></tr>
                  ) : (
                    paymentRecords.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="px-2 py-1">{p.date}</td>
                        <td className="px-2 py-1 text-right">{formatPrice(Number(p.amount || 0))}</td>
                        <td className="px-2 py-1">{p.note || "—"}</td>
                        <td className="px-2 py-1 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={saving}
                            onClick={() => deletePaymentRecord(p.id)}
                          >
                            Delete
                          </Button>
                        </td>
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

