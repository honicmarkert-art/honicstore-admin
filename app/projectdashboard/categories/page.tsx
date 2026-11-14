"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"
import { useProjectYear } from "@/contexts/project-year-context"
import { projectYearLabel } from "@/lib/project-year"

const CATEGORIES = [
  { id: "fyp", label: "FYP projects", detail: "Final year projects" },
  { id: "side", label: "Side projects", detail: "Work outside a final year project" },
  { id: "research", label: "Researches", detail: "Research work" },
] as const

type CategoryId = (typeof CATEGORIES)[number]["id"] | ""

type ProjectRow = {
  id: string
  invoice_number: string
  client_name: string
  issue_date: string | null
  grand_total: number
  category: CategoryId
}

function asCategory(value: unknown): CategoryId {
  const id = String(value || "")
  return id === "fyp" || id === "side" || id === "research" ? id : ""
}

export default function ProjectCategoriesPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const projectYear = useProjectYear()
  const selectedYear = projectYear?.year
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const showLoading = loading && rows.length === 0

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const yearQs = selectedYear ? `&year=${selectedYear}` : ""
        const res = await fetch(`/api/admin/invoices?limit=200&scope=project${yearQs}&t=${Date.now()}`, {
          cache: "no-store",
          credentials: "include",
        })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load projects")
        if (cancelled) return
        const next = (Array.isArray(data.invoices) ? data.invoices : [])
          .filter((invoice: { hiddenFromList?: boolean; payload?: { documentKind?: string } }) => {
            if (invoice.hiddenFromList) return false
            const kind = String(invoice.payload?.documentKind || "invoice")
            return kind === "invoice"
          })
          .map((invoice: { id: string; invoice_number?: string; client_name?: string; issue_date?: string | null; grand_total?: number; payload?: { projectCategory?: string } }) => ({
            id: String(invoice.id),
            invoice_number: String(invoice.invoice_number || ""),
            client_name: String(invoice.client_name || ""),
            issue_date: invoice.issue_date || null,
            grand_total: Number(invoice.grand_total || 0),
            category: asCategory(invoice.payload?.projectCategory),
          }))
        setRows(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load projects")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedYear])

  const grouped = useMemo(() => {
    return {
      fyp: rows.filter((row) => row.category === "fyp"),
      side: rows.filter((row) => row.category === "side"),
      research: rows.filter((row) => row.category === "research"),
      unset: rows.filter((row) => !row.category),
    }
  }, [rows])

  const assignCategory = async (id: string, category: CategoryId) => {
    setError(null)
    const previous = rows
    setRows((current) => current.map((row) => (row.id === id ? { ...row, category } : row)))
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectCategory: category }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not save the category")
    } catch (e) {
      setRows(previous)
      setError(e instanceof Error ? e.message : "Could not save the category")
    }
  }

  const renderTable = (items: ProjectRow[]) => {
    if (!items.length) {
      return <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>None in this year.</p>
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left">Invoice</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Issued</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Category</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/projectdashboard/invoice?invoiceId=${row.id}&mode=preview`} className="text-[#184a96] hover:underline">
                    {row.invoice_number || "Invoice"}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.client_name || "—"}</td>
                <td className="px-3 py-2">{row.issue_date ? new Date(row.issue_date).toLocaleDateString("en-GB") : "—"}</td>
                <td className="px-3 py-2 text-right">{formatPrice(row.grand_total)}</td>
                <td className="px-3 py-2">
                  <select
                    value={row.category}
                    onChange={(event) => assignCategory(row.id, asCategory(event.target.value))}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  >
                    <option value="">Not set</option>
                    {CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project categories</h1>
        <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
          {selectedYear ? `Year ${selectedYear}: ${projectYearLabel(selectedYear)}. ` : ""}
          FYP projects, side projects, and researches. Choose a category on an invoice, or set it here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Card key={category.id} className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{category.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{showLoading ? "..." : grouped[category.id].length}</p>
              <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>{category.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {CATEGORIES.map((category) => (
        <Card key={category.id} className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader>
            <CardTitle className="text-base">{category.label}</CardTitle>
          </CardHeader>
          <CardContent>{showLoading ? <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading...</p> : renderTable(grouped[category.id])}</CardContent>
        </Card>
      ))}

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader>
          <CardTitle className="text-base">Not set yet</CardTitle>
        </CardHeader>
        <CardContent>{showLoading ? <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading...</p> : renderTable(grouped.unset)}</CardContent>
      </Card>
    </div>
  )
}
