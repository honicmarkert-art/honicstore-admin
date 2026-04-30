"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"

type UsageRow = {
  client_name: string
  component_usage: number
  prototype_usage: number
  service_used: number
  total_price: number
  price_used: number
  remaining_price: number
  invoice_count: number
}

type UsageSummary = {
  clientCount: number
  invoiceCount: number
  componentUsage: number
  prototypeUsage: number
  serviceUsed: number
  totalPrice: number
  priceUsed: number
  remainingPrice: number
}

export default function ProjectUsagePage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const [rows, setRows] = useState<UsageRow[]>([])
  const [summary, setSummary] = useState<UsageSummary>({
    clientCount: 0,
    invoiceCount: 0,
    componentUsage: 0,
    prototypeUsage: 0,
    serviceUsed: 0,
    totalPrice: 0,
    priceUsed: 0,
    remainingPrice: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/invoices/project-usage?t=${Date.now()}`, { cache: "no-store", credentials: "include" })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load usage summary")
        if (cancelled) return
        setRows(Array.isArray(data.rows) ? data.rows : [])
        setSummary({
          clientCount: Number(data.summary?.clientCount || 0),
          invoiceCount: Number(data.summary?.invoiceCount || 0),
          componentUsage: Number(data.summary?.componentUsage || 0),
          prototypeUsage: Number(data.summary?.prototypeUsage || 0),
          serviceUsed: Number(data.summary?.serviceUsed || 0),
          totalPrice: Number(data.summary?.totalPrice || 0),
          priceUsed: Number(data.summary?.priceUsed || 0),
          remainingPrice: Number(data.summary?.remainingPrice || 0),
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load usage summary")
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
        <h1 className="text-3xl font-bold tracking-tight">Project Usage Tracking</h1>
        <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
          Client-level summary of component/prototype/service usage, spent amount, and remaining balance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}><CardHeader className="pb-2"><CardTitle className="text-sm">Clients</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.clientCount}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}><CardHeader className="pb-2"><CardTitle className="text-sm">Total price</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatPrice(summary.totalPrice)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}><CardHeader className="pb-2"><CardTitle className="text-sm">Price used</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatPrice(summary.priceUsed)}</CardContent></Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}><CardHeader className="pb-2"><CardTitle className="text-sm">Remaining price</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatPrice(summary.remainingPrice)}</CardContent></Card>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardContent className="pt-6">
          {loading ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading usage table...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No project usage data found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left font-semibold">Client name</th>
                    <th className="px-3 py-2 text-right font-semibold">Component usage</th>
                    <th className="px-3 py-2 text-right font-semibold">Prototype usage</th>
                    <th className="px-3 py-2 text-right font-semibold">Service used</th>
                    <th className="border-l border-border px-3 py-2 text-right font-semibold">Total price</th>
                    <th className="px-3 py-2 text-right font-semibold">Price used</th>
                    <th className="px-3 py-2 text-right font-semibold">Remaining price</th>
                    <th className="px-3 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.client_name} className="border-b odd:bg-transparent even:bg-muted/10">
                      <td className="px-3 py-2 font-medium">{r.client_name}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.component_usage)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.prototype_usage)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.service_used)}</td>
                      <td className="border-l border-border px-3 py-2 text-right">{formatPrice(r.total_price)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.price_used)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(r.remaining_price)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/projectdashboard/usage/enter?clientName=${encodeURIComponent(r.client_name)}`}>
                              Enter usage
                            </Link>
                          </Button>
                          <Button asChild size="sm">
                            <Link href={`/projectdashboard/usage/view?clientName=${encodeURIComponent(r.client_name)}`}>
                              View
                            </Link>
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
