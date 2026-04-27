"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Package,
  Users,
  Banknote,
  ShoppingCart,
  Eye,
  Star,
  Plus,
  AlertTriangle,
  CheckCircle,
  Tag,
  BarChart3,
  ReceiptText,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useCurrency } from "@/contexts/currency-context"
import Link from "next/link"
import Image from "next/image"
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

type DashboardOrder = {
  id: string
  orderNumber: string
  total: number
  createdAt: string
  itemCount: number
  source: "pending" | "confirmed"
}

export default function AdminDashboard() {
  const { themeClasses } = useTheme()
  const { products, isLoading: productsLoading } = useProducts()
  const { user } = useAuth()
  const { formatPrice } = useCurrency()
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")
  const [orders, setOrders] = useState<any[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
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
          fetch(`/api/admin/invoices?t=${ts}&summaryOnly=true`, { cache: "no-store", credentials: "include" }),
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
    const activeProducts = products.filter((p) => p.inStock !== false).length
    const productsWithDiscounts = products.filter((p) => p.originalPrice > p.price).length
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
    const highViews = products.filter((p) => (p.views || 0) >= 100).length
    const featuredLike = products.filter((p) => (p.rating || 0) >= 4.5).length
    return {
      totalViews,
      avgRating,
      activeProducts,
      productsWithDiscounts,
      outOfStock,
      lowStock,
      inStockCount,
      newArrivals,
      onSale,
      highViews,
      featuredLike,
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
    for (const o of orders) {
      const t = o.created_at || o.createdAt
      if (!t) continue
      recentList.push({
        id: String(o.id),
        orderNumber: o.order_number || o.orderNumber || String(o.id).slice(0, 8),
        total: Number(o.total_amount ?? o.calculated_total ?? 0),
        createdAt: t,
        itemCount: o.total_items || (o.order_items?.length ?? 0),
        source: "pending",
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

    const now = new Date()
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

  const recentProducts = products.slice(0, 5)

  const loading = productsLoading || statsLoading

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
          <p className={cn("text-lg", themeClasses.mainText)}>Loading dashboard data…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={cn("text-4xl font-bold", themeClasses.mainText)}>Dashboard</h1>
          <p className={cn("text-base", themeClasses.textNeutralSecondary)}>
            Welcome back
            {user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}! Store overview in TZS. Period
            filters apply to orders and revenue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={timeRange === "7d" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("7d")}
          >
            7D
          </Button>
          <Button
            variant={timeRange === "30d" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("30d")}
          >
            30D
          </Button>
          <Button
            variant={timeRange === "90d" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("90d")}
          >
            90D
          </Button>
        </div>
      </div>

      {statsError && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{statsError}</p>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Total products
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              <span className="text-green-600 dark:text-green-400">{productStats.activeProducts}</span> in stock
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Revenue ({timeRange.toUpperCase()})
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(metrics.totalRevenueTzs)}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              Paid + confirmed in period
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Orders ({timeRange.toUpperCase()})
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.orderCount}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              New + confirmed in range
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Product views
            </CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productStats.totalViews.toLocaleString()}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              {productStats.productsWithDiscounts} on sale
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Avg product rating
            </CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productStats.avgRating}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              {products.filter((p) => p.rating >= 4).length} at 4★+
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.userCount}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              {metrics.activeUsers} signed in (30d)
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Total invoices
            </CardTitle>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoiceSummary.totalCount}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              Saved invoices
            </p>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Invoice amount total
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(invoiceSummary.totalAmount)}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              Sum of all saved invoices
            </p>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Payment made (paid)
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(invoiceSummary.totalPaid)}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              Paid amount from invoice payments
            </p>
          </CardContent>
        </Card>
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={cn("text-sm font-medium", themeClasses.textNeutralSecondary)}>
              Total due
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(invoiceSummary.totalDue)}</div>
            <p className={cn("text-xs", themeClasses.textNeutralSecondary)}>
              Remaining amount on saved invoices
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <p>
          Avg order value (paid, period revenue basis): <strong className="text-foreground">{formatPrice(metrics.avgOrderValue)}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className={cn("lg:col-span-2", themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader>
            <CardTitle className={cn("text-xl font-bold", themeClasses.mainText)}>Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.recentOrders.length === 0 ? (
              <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {metrics.recentOrders.map((ro) => (
                  <div
                    key={ro.id}
                    className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={cn("h-10 w-10 rounded-full", themeClasses.cardBg)} />
                      <div>
                        <p className={cn("text-base font-medium", themeClasses.mainText)}>
                          {ro.orderNumber}
                          {ro.source === "confirmed" && (
                            <span className="ml-2 text-xs text-green-600">Confirmed</span>
                          )}
                        </p>
                        <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>
                          {formatDistanceToNow(new Date(ro.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-base font-medium", themeClasses.mainText)}>
                        {formatPrice(ro.total)}
                      </p>
                      <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>{ro.itemCount} items</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/orders">Pending orders</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/confirmed-orders">Confirmed</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBorder, themeClasses.cardBg)}>
          <CardHeader>
            <CardTitle className={cn("text-xl font-bold", themeClasses.mainText)}>Top products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentProducts.length === 0 ? (
                <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No products loaded.</p>
              ) : (
                recentProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center space-x-4 rounded-lg p-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {product.image && (
                      <Image
                        src={product.image}
                        alt={product.name}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-base font-medium", themeClasses.mainText)}>{product.name}</p>
                      <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>
                        {product.views ?? 0} views · {product.category}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className={cn("text-base font-medium", themeClasses.mainText)}>{formatPrice(product.price)}</p>
                      <div className="flex items-center justify-end text-sm">
                        <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className={themeClasses.textNeutralSecondary}>{product.rating}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Button className="mt-4 w-full" variant="outline" asChild>
              <Link href="/dashboard/products">View all products</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader>
          <CardTitle className={cn("text-xl font-bold", themeClasses.mainText)}>Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Link href="/dashboard/products/new">
              <Button className="h-12 w-full text-base">
                <Plus className="mr-2 h-5 w-5" />
                Add product
              </Button>
            </Link>
            <Button variant="outline" className="h-12 w-full text-base" asChild>
              <Link href="/dashboard/products/out-of-stock">
                <Package className="mr-2 h-5 w-5" />
                Out of stock
              </Link>
            </Button>
            <Button variant="outline" className="h-12 w-full text-base" asChild>
              <Link href="/dashboard/users">
                <Users className="mr-2 h-5 w-5" />
                Customers
              </Link>
            </Button>
            <Button variant="outline" className="h-12 w-full text-base" asChild>
              <Link href="/dashboard/orders">
                <ShoppingCart className="mr-2 h-5 w-5" />
                All orders
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader>
            <CardTitle className={cn("flex items-center gap-2 text-xl font-bold", themeClasses.mainText)}>
              <Package className="h-6 w-6" />
              Inventory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="font-medium text-red-800 dark:text-red-200">Out of stock</span>
                </div>
                <span className="text-red-700 dark:text-red-300">{productStats.outOfStock}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/40 dark:bg-orange-950/20">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <span className="font-medium text-orange-800 dark:text-orange-200">Low stock (1–5)</span>
                </div>
                <span className="text-orange-700 dark:text-orange-300">{productStats.lowStock}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-950/20">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-green-800 dark:text-green-200">In stock</span>
                </div>
                <span className="text-green-700 dark:text-green-300">{productStats.inStockCount}</span>
              </div>
            </div>
            <div className="mt-4 border-t pt-4">
              <Button className="h-12 w-full bg-yellow-500 text-base text-white hover:bg-yellow-600" asChild>
                <Link href="/dashboard/products">
                  <BarChart3 className="mr-2 h-5 w-5" />
                  Manage products
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
          <CardHeader>
            <CardTitle className={cn("flex items-center gap-2 text-xl font-bold", themeClasses.mainText)}>
              <Tag className="h-6 w-6" />
              Product mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Tag className="h-5 w-5 text-red-500" />
                  <span>On sale</span>
                </div>
                <span>{productStats.onSale}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Plus className="h-5 w-5 text-blue-500" />
                  <span>New arrivals</span>
                </div>
                <span>{productStats.newArrivals}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Star className="h-5 w-5 text-green-500" />
                  <span>High rating (4.5+)</span>
                </div>
                <span>{productStats.featuredLike}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-purple-500" />
                  <span>100+ views</span>
                </div>
                <span>{productStats.highViews}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
