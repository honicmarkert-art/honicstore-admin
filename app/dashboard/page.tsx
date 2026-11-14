"use client"

import { useEffect, useMemo, useState } from "react"
import { Banknote } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"
import Link from "next/link"
import { useProducts } from "@/hooks/use-products"
import { useAuth } from "@/contexts/auth-context"
import { formatDistanceToNow } from "date-fns"

type TimeRange = "7d" | "30d" | "90d"

function rangeStartDate(timeRange: TimeRange): Date {
  const d = new Date()
  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

function isPaid(status: string | undefined): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === "paid" || s === "success"
}

type RawOrder = {
  id?: string | number
  created_at?: string
  createdAt?: string
  confirmed_at?: string
  confirmedAt?: string
  payment_status?: string
  status?: string
  failure_reason?: string
  total_amount?: number | string | null
  calculated_total?: number | string | null
  order_number?: string
  orderNumber?: string
  total_items?: number
  order_items?: unknown[]
  confirmed_order_items?: { quantity?: number }[]
}

type RawProfile = {
  last_sign_in_at?: string | null
}

type DashboardOrder = {
  id: string
  orderNumber: string
  total: number
  createdAt: string
  itemCount: number
  source: "pending" | "confirmed" | "expired" | "cancelled"
}

export default function AdminDashboard() {
  const { themeClasses } = useTheme()
  const { products, isLoading: productsLoading } = useProducts()
  const { user } = useAuth()
  const { formatPrice } = useCurrency()
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")
  const [orders, setOrders] = useState<RawOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<RawOrder[]>([])
  const [profiles, setProfiles] = useState<RawProfile[]>([])
  const [invoiceSummary, setInvoiceSummary] = useState<{ totalCount: number; totalAmount: number; totalPaid: number; totalDue: number }>({
    totalCount: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalDue: 0,
  })
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatsLoading(true)
      setStatsError(null)
      try {
        const ts = Date.now()
        const [oRes, cRes, uRes, iRes] = await Promise.all([
          fetch(`/api/admin/orders?t=${ts}`, { cache: "no-store", credentials: "include" }),
          fetch(`/api/admin/confirmed-orders?t=${ts}`, { cache: "no-store", credentials: "include" }),
          fetch(`/api/admin/users?t=${ts}`, { cache: "no-store", credentials: "include" }),
          fetch(`/api/admin/invoices?t=${ts}&summaryOnly=true&scope=main`, { cache: "no-store", credentials: "include" }),
        ])
        if (cancelled) return
        if (!oRes.ok || !cRes.ok || !uRes.ok || !iRes.ok) {
          setStatsError("Could not load all dashboard data. Some numbers may be incomplete.")
        }
        const oJson = oRes.ok ? await oRes.json() : { orders: [] }
        const cJson = cRes.ok ? await cRes.json() : { orders: [] }
        const uJson = uRes.ok ? await uRes.json() : { users: [] }
        const iJson = iRes.ok ? await iRes.json() : { summary: { totalCount: 0, totalAmount: 0 } }
        setOrders(Array.isArray(oJson.orders) ? oJson.orders : [])
        setConfirmedOrders(Array.isArray(cJson.orders) ? cJson.orders : [])
        setProfiles(Array.isArray(uJson.users) ? uJson.users : [])
        setInvoiceSummary({
          totalCount: Number(iJson?.summary?.totalCount || 0),
          totalAmount: Number(iJson?.summary?.totalAmount || 0),
          totalPaid: Number(iJson?.summary?.totalPaid || 0),
          totalDue: Number(iJson?.summary?.totalDue || 0),
        })
      } catch {
        if (!cancelled) setStatsError("Failed to load dashboard statistics.")
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const start = useMemo(() => rangeStartDate(timeRange), [timeRange])

  const productStats = useMemo(() => {
    const totalViews = products.reduce((sum, p) => sum + (p.views || 0), 0)
    const avgRating =
      products.length > 0
        ? (products.reduce((sum, p) => sum + p.rating, 0) / products.length).toFixed(1)
        : "0.0"
    const outOfStock = products.filter(
      (p) => p.inStock === false || (p.stockQuantity !== undefined && p.stockQuantity <= 0)
    ).length
    const lowStock = products.filter((p) => {
      const q = p.stockQuantity
      if (q === undefined) return false
      return p.inStock !== false && q > 0 && q <= 5
    }).length
    const inStockCount = products.filter(
      (p) => p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0)
    ).length
    const newArrivals = products.filter((p) => p.is_new === true).length
    const onSale = products.filter((p) => p.originalPrice > p.price).length
    return {
      totalViews,
      avgRating,
      outOfStock,
      lowStock,
      inStockCount,
      newArrivals,
      onSale,
    }
  }, [products])

  const metrics = useMemo(() => {
    const paidPending = orders.filter((o) => {
      const t = o.created_at || o.createdAt
      if (!t) return false
      if (new Date(t) < start) return false
      return isPaid(o.payment_status)
    })
    const revenuePending = paidPending.reduce(
      (s, o) => s + Number(o.total_amount ?? o.calculated_total ?? 0),
      0
    )

    const confirmedInRange = confirmedOrders.filter((o) => {
      const t = o.confirmed_at || o.confirmedAt || o.created_at
      if (!t) return false
      return new Date(t) >= start
    })
    const revenueConfirmed = confirmedInRange.reduce(
      (s, o) => s + Number(o.total_amount ?? 0),
      0
    )

    const totalRevenueTzs = revenuePending + revenueConfirmed

    const ordersInRange = orders.filter((o) => {
      const t = o.created_at || o.createdAt
      return t && new Date(t) >= start
    })
    const orderCount = ordersInRange.length + confirmedInRange.length

    const revenueOrderCount = paidPending.length + confirmedInRange.length
    const avgOrderValue = revenueOrderCount > 0 ? totalRevenueTzs / revenueOrderCount : 0

    const recentList: DashboardOrder[] = []
    const confirmationWindowMs = 15 * 60 * 1000
    for (const o of orders) {
      const t = o.created_at || o.createdAt
      if (!t) continue
      const status = String(o.status || "pending")
      const waitingTooLong = status === "pending" && Date.now() - new Date(t).getTime() >= confirmationWindowMs
      const expired = waitingTooLong || (status === "cancelled" && String(o.failure_reason || "").toLowerCase().includes("expired"))
      const confirmed = ["confirmed", "shipped", "delivered", "ready_for_pickup", "picked_up"].includes(status)
      recentList.push({
        id: String(o.id),
        orderNumber: o.order_number || o.orderNumber || String(o.id).slice(0, 8),
        total: Number(o.total_amount ?? o.calculated_total ?? 0),
        createdAt: t,
        itemCount: o.total_items || (o.order_items?.length ?? 0),
        source: expired ? "expired" : confirmed ? "confirmed" : status === "cancelled" ? "cancelled" : "pending",
      })
    }
    for (const o of confirmedOrders) {
      const t = o.confirmed_at || o.confirmedAt || o.created_at
      if (!t) continue
      recentList.push({
        id: `c-${o.id}`,
        orderNumber: o.order_number || o.orderNumber || String(o.id).slice(0, 8),
        total: Number(o.total_amount ?? 0),
        createdAt: t,
        itemCount: (o.confirmed_order_items || []).reduce(
          (s: number, it: { quantity?: number }) => s + (it.quantity || 0),
          0
        ),
        source: "confirmed",
      })
    }
    recentList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const recentOrders = recentList.slice(0, 5)

    const last30 = new Date()
    last30.setDate(last30.getDate() - 30)
    const activeUsers = profiles.filter((p) => {
      if (!p.last_sign_in_at) return false
      return new Date(p.last_sign_in_at) >= last30
    }).length

    return {
      totalRevenueTzs,
      orderCount,
      avgOrderValue,
      recentOrders,
      userCount: profiles.length,
      activeUsers,
    }
  }, [orders, confirmedOrders, profiles, start])

  const loading = productsLoading || statsLoading

  const invoiceBase = invoiceSummary.totalPaid + invoiceSummary.totalDue
  const paidShare = invoiceBase > 0 ? Math.min(100, Math.round((invoiceSummary.totalPaid / invoiceBase) * 100)) : 0

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#184a96] border-t-transparent" />
          <p className={cn("text-sm", themeClasses.mainText)}>Loading financials…</p>
        </div>
      </div>
    )
  }

  const moneyCards = [
    { label: "Invoice total", value: formatPrice(invoiceSummary.totalAmount), note: `${invoiceSummary.totalCount} saved invoices` },
    { label: "Paid", value: formatPrice(invoiceSummary.totalPaid), note: "Recorded on invoices" },
    { label: "Still due", value: formatPrice(invoiceSummary.totalDue), note: "Remaining on invoices" },
    { label: "Avg order", value: formatPrice(metrics.avgOrderValue), note: "Paid orders in this period" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#184a96]">Honic Company Limited</p>
          <h1 className={cn("mt-1 text-3xl font-semibold tracking-tight", themeClasses.mainText)}>Store financial</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            {user?.user_metadata?.full_name ? `${user.user_metadata.full_name}. ` : ""}
            Order revenue follows the period. Invoice totals are the saved invoices.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900">
          {(["7d", "30d", "90d"] as TimeRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                timeRange === range ? "bg-[#184a96] text-white" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              )}
            >
              {range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {statsError && <p className="text-sm text-amber-700 dark:text-amber-300">{statsError}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="rounded-2xl bg-[#184a96] p-6 text-white">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/80">Order revenue · {timeRange === "7d" ? "7 days" : timeRange === "30d" ? "30 days" : "90 days"}</p>
            <Banknote className="h-5 w-5 text-white/70" />
          </div>
          <p className="mt-3 text-4xl font-semibold tracking-tight">{formatPrice(metrics.totalRevenueTzs)}</p>
          <p className="mt-2 text-sm text-white/80">{metrics.orderCount} orders · paid and confirmed in this period</p>
          <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-sm">
            <div>
              <p className="text-white/70">Customers</p>
              <p className="mt-1 text-lg font-semibold">{metrics.userCount}</p>
            </div>
            <div>
              <p className="text-white/70">Active 30d</p>
              <p className="mt-1 text-lg font-semibold">{metrics.activeUsers}</p>
            </div>
            <div>
              <p className="text-white/70">Products</p>
              <p className="mt-1 text-lg font-semibold">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {moneyCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium text-neutral-500">{card.label}</p>
              <p className={cn("mt-2 text-xl font-semibold tracking-tight", themeClasses.mainText)}>{card.value}</p>
              <p className="mt-1 text-xs text-neutral-500">{card.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-3">
          <p className={cn("text-sm font-semibold", themeClasses.mainText)}>Invoice collections</p>
          <p className="text-xs text-neutral-500">{paidShare}% collected</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-[#184a96]" style={{ width: `${paidShare}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs text-neutral-500">
          <span>Paid {formatPrice(invoiceSummary.totalPaid)}</span>
          <span>Due {formatPrice(invoiceSummary.totalDue)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
            <h2 className={cn("text-sm font-semibold", themeClasses.mainText)}>Recent orders</h2>
            <div className="flex gap-3 text-xs">
              <Link href="/dashboard/orders" className="text-[#184a96]">Awaiting confirmation</Link>
              <Link href="/dashboard/confirmed-orders" className="text-[#184a96]">Confirmed</Link>
            </div>
          </div>
          {metrics.recentOrders.length === 0 ? (
            <p className="px-5 py-8 text-sm text-neutral-500">No orders yet.</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {metrics.recentOrders.map((ro) => (
                <div key={ro.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className={cn("text-sm font-medium", themeClasses.mainText)}>
                      {ro.orderNumber}
                      <span className={cn("ml-2 text-xs font-normal", ro.source === "confirmed" ? "text-emerald-600" : ro.source === "pending" ? "text-amber-600" : "text-red-600")}>
                        {ro.source === "confirmed" ? "Confirmed" : ro.source === "expired" ? "Expired" : ro.source === "cancelled" ? "Cancelled" : "Awaiting confirmation"}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500">{formatDistanceToNow(new Date(ro.createdAt), { addSuffix: true })} · {ro.itemCount} items</p>
                  </div>
                  <p className={cn("text-sm font-semibold tabular-nums", themeClasses.mainText)}>{formatPrice(ro.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className={cn("text-sm font-semibold", themeClasses.mainText)}>Stock</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">In stock</span><span className="font-medium">{productStats.inStockCount}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Low stock</span><span className="font-medium">{productStats.lowStock}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Out of stock</span><span className="font-medium">{productStats.outOfStock}</span></div>
            </div>
            <Link href="/dashboard/products" className="mt-4 inline-block text-sm text-[#184a96]">Manage products</Link>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className={cn("text-sm font-semibold", themeClasses.mainText)}>Catalog</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Views</span><span className="font-medium">{productStats.totalViews.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">On sale</span><span className="font-medium">{productStats.onSale}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">New arrivals</span><span className="font-medium">{productStats.newArrivals}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Avg rating</span><span className="font-medium">{productStats.avgRating}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
