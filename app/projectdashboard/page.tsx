"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"
import { useProjectYear } from "@/contexts/project-year-context"
import { projectYearSpan } from "@/lib/project-year"

type Phase = { phase: string; description: string; amount: number; paid: number; due: number }

type Row = {
  id: string
  invoice_number: string
  client_name: string
  issue_date?: string | null
  electrical: number
  prototype: number
  service: number
  tax: number
  total_price: number
  total_paid: number
  total_due: number
}

type Summary = {
  invoiceCount: number
  clientCount: number
  electrical: number
  prototype: number
  service: number
  tax: number
  totalPrice: number
  totalPaid: number
  totalDue: number
  phases: Phase[]
}

const emptySummary: Summary = {
  invoiceCount: 0,
  clientCount: 0,
  electrical: 0,
  prototype: 0,
  service: 0,
  tax: 0,
  totalPrice: 0,
  totalPaid: 0,
  totalDue: 0,
  phases: [],
}

function formatIssueDate(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-GB")
}

export default function ProjectDashboardPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const projectYear = useProjectYear()
  const selectedYear = projectYear?.year
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [loading, setLoading] = useState(true)
  const showLoading = loading && rows.length === 0
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const yearQs = selectedYear ? `&year=${selectedYear}` : ""
        const res = await fetch(`/api/admin/invoices/service-costs?t=${Date.now()}${yearQs}`, { cache: "no-store", credentials: "include" })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load summary")
        if (cancelled) return
        const nextRows = Array.isArray(data.rows) ? data.rows : []
        nextRows.sort((a: Row, b: Row) => String(a.client_name || "").localeCompare(String(b.client_name || "")))
        setRows(nextRows)
        setSummary({
          invoiceCount: Number(data.summary?.invoiceCount || nextRows.length),
          clientCount: Number(data.summary?.clientCount || 0),
          electrical: Number(data.summary?.electrical || 0),
          prototype: Number(data.summary?.prototype || 0),
          service: Number(data.summary?.service || 0),
          tax: Number(data.summary?.tax || 0),
          totalPrice: Number(data.summary?.totalPrice || 0),
          totalPaid: Number(data.summary?.totalPaid || 0),
          totalDue: Number(data.summary?.totalDue || 0),
          phases: Array.isArray(data.summary?.phases) ? data.summary.phases : [],
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
  }, [selectedYear])

  const figures = [
    { label: "Invoices", value: showLoading ? "..." : String(summary.invoiceCount) },
    { label: "Clients", value: showLoading ? "..." : String(summary.clientCount) },
    { label: "Electrical components", value: formatPrice(summary.electrical) },
    { label: "Prototype", value: formatPrice(summary.prototype) },
    { label: "Service", value: formatPrice(summary.service) },
    { label: "Invoice total", value: formatPrice(summary.totalPrice) },
    { label: "Paid", value: formatPrice(summary.totalPaid) },
    { label: "Still due", value: formatPrice(summary.totalDue) },
  ]

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Financial summary</h1>
        <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
          {selectedYear ? `${projectYearSpan(selectedYear)}. ` : ""}
          Totals come from the electrical, prototype, and service lines saved on project invoices, plus the payments recorded against them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {figures.map((item) => (
          <Card key={item.label} className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
            <CardHeader className="space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      {summary.tax > 0 ? (
        <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Tax included in the invoice total: {formatPrice(summary.tax)}</p>
      ) : null}

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader>
          <CardTitle className="text-base">Payment schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading schedule...</p>
          ) : summary.phases.length === 0 ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No invoices in this year.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left">Phase</th>
                    <th className="px-3 py-2 text-left">What it covers</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.phases.map((phase) => (
                    <tr key={phase.phase} className="border-b">
                      <td className="px-3 py-2">{phase.phase}</td>
                      <td className="px-3 py-2">{phase.description}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(phase.amount)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(phase.paid)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(phase.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader>
          <CardTitle className="text-base">Invoices in this year</CardTitle>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading invoices...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No project invoices in this year.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-left">Issued</th>
                    <th className="px-3 py-2 text-right">Electrical</th>
                    <th className="px-3 py-2 text-right">Prototype</th>
                    <th className="px-3 py-2 text-right">Service</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/projectdashboard/invoice?invoiceId=${row.id}&mode=preview`} className="text-[#184a96] hover:underline">
                          {row.invoice_number || "Invoice"}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{row.client_name || "—"}</td>
                      <td className="px-3 py-2">{formatIssueDate(row.issue_date)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(row.electrical)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(row.prototype)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(row.service)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(row.total_price)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(row.total_paid)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(row.total_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {error && rows.length > 0 ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
