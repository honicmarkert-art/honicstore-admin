"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"

type Row = {
  client_name: string
  real_component_price: number
  real_prototype_price: number
  real_service_price: number
  component_usage: number
  prototype_usage: number
  service_used: number
  component_note?: string
  prototype_note?: string
  service_note?: string
  total_price: number
  price_used: number
  remaining_price: number
}

export default function ProjectUsageViewPage() {
  const { themeClasses } = useTheme()
  const { formatPrice } = useCurrency()
  const sp = useSearchParams()
  const clientName = String(sp.get("clientName") || "").trim()
  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!clientName) {
        setLoading(false)
        setError("Client name is required.")
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/invoices/project-usage?clientName=${encodeURIComponent(clientName)}&t=${Date.now()}`, {
          cache: "no-store",
          credentials: "include",
        })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load usage detail")
        if (cancelled) return
        const first = Array.isArray(data.rows) && data.rows.length ? data.rows[0] : null
        setRow(first)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load usage detail")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [clientName])

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Detail</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            Real invoice price vs used price per section and total usage.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/projectdashboard/usage">Back to usage table</Link>
        </Button>
      </div>

      {loading ? <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading usage detail...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error && row ? (
        <div className="space-y-4">
          <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
            <CardHeader><CardTitle className="text-base">Client: {row.client_name}</CardTitle></CardHeader>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
              <CardHeader className="pb-2"><CardTitle className="text-base">Component</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Real price:</strong> {formatPrice(row.real_component_price)}</p>
                <p><strong>Used price:</strong> {formatPrice(row.component_usage)}</p>
                <p><strong>Remaining:</strong> {formatPrice(Math.max(0, row.real_component_price - row.component_usage))}</p>
                <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                  <strong>Note:</strong> {row.component_note || "No note added."}
                </p>
              </CardContent>
            </Card>

            <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
              <CardHeader className="pb-2"><CardTitle className="text-base">Prototype</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Real price:</strong> {formatPrice(row.real_prototype_price)}</p>
                <p><strong>Used price:</strong> {formatPrice(row.prototype_usage)}</p>
                <p><strong>Remaining:</strong> {formatPrice(Math.max(0, row.real_prototype_price - row.prototype_usage))}</p>
                <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                  <strong>Note:</strong> {row.prototype_note || "No note added."}
                </p>
              </CardContent>
            </Card>

            <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
              <CardHeader className="pb-2"><CardTitle className="text-base">Service</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Real price:</strong> {formatPrice(row.real_service_price)}</p>
                <p><strong>Used price:</strong> {formatPrice(row.service_used)}</p>
                <p><strong>Remaining:</strong> {formatPrice(Math.max(0, row.real_service_price - row.service_used))}</p>
                <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                  <strong>Note:</strong> {row.service_note || "No note added."}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
            <CardHeader className="pb-2"><CardTitle className="text-base">Total Usage Summary</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <p><strong>Total real price:</strong> {formatPrice(row.total_price)}</p>
              <p><strong>Total used price:</strong> {formatPrice(row.price_used)}</p>
              <p><strong>Total remaining:</strong> {formatPrice(row.remaining_price)}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
