"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Edit, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProductForm } from "@/app/dashboard/products/product-form"
import { useTheme } from "@/hooks/use-theme"
import { useToast } from "@/hooks/use-toast"
import { useProducts } from "@/hooks/use-products"
import { useCurrency } from "@/contexts/currency-context"
import { cn } from "@/lib/utils"
import type { Product } from "@/hooks/use-products"

type ReviewMode = "not-corrected" | "corrected"

function readReviewFlag(p: Product & Record<string, unknown>): boolean {
  return Boolean(p.admin_review_corrected ?? p.adminReviewCorrected)
}

function readStockQty(p: Product & Record<string, unknown>): number | null {
  const direct = p.stockQuantity ?? p.stock_quantity
  if (typeof direct === "number" && Number.isFinite(direct)) return direct
  const variants = (p.variants || p.product_variants) as Array<{ stockQuantity?: number; stock_quantity?: number }> | undefined
  if (Array.isArray(variants) && variants.length > 0) {
    const sum = variants.reduce((acc, v) => {
      const q = v.stockQuantity ?? v.stock_quantity
      return acc + (typeof q === "number" && Number.isFinite(q) ? q : 0)
    }, 0)
    return sum
  }
  return null
}

export function ProductReviewQueue({ mode }: { mode: ReviewMode }) {
  const { themeClasses } = useTheme()
  const { toast } = useToast()
  const { formatPrice } = useCurrency()
  const { fetchFullProductDetails, updateProduct } = useProducts()
  const wantCorrected = mode === "corrected"
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null)

  const title = wantCorrected ? "Corrected" : "Not corrected"
  const description = wantCorrected
    ? "Products marked as reviewed. Uncheck to send back to the not-corrected list."
    : "Products pending review. Tick “Corrected” when done, or open the full editor."

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const batch = 200
        let offset = 0
        const acc: Product[] = []
        let hasMore = true
        while (hasMore && !cancelled) {
          const params = new URLSearchParams({
            limit: String(batch),
            offset: String(offset),
            admin_review_corrected: wantCorrected ? "true" : "false",
            t: String(Date.now()),
          })
          const res = await fetch(`/api/products?${params}`, {
            credentials: "include",
            headers: { "Cache-Control": "no-cache" },
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
          }
          const chunk: Product[] = Array.isArray(data) ? data : data?.products || []
          acc.push(...chunk)
          const pagination = !Array.isArray(data) ? data?.pagination : null
          const total = pagination?.total
          if (typeof total === "number" && acc.length >= total) {
            hasMore = false
          } else {
            hasMore = chunk.length >= batch
          }
          offset += batch
          if (chunk.length === 0) hasMore = false
        }
        if (!cancelled) setItems(acc)
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load products",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          })
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [wantCorrected, toast, refreshKey])

  const setFlag = async (productId: number, corrected: boolean) => {
    setBusyId(productId)
    try {
      const res = await fetch(`/api/products/${productId}?t=${Date.now()}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify({ adminReviewCorrected: corrected }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      }
      setItems((prev) => prev.filter((p) => p.id !== productId))
      toast({
        title: corrected ? "Marked corrected" : "Moved to not corrected",
        description: `Product #${productId} updated.`,
      })
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  const sorted = useMemo(() => [...items].sort((a, b) => b.id - a.id), [items])

  const openEditDialog = async (productId: number) => {
    setEditLoadingId(productId)
    try {
      const full = await fetchFullProductDetails(productId)
      if (full) {
        setEditingProduct(full)
        setEditOpen(true)
      } else {
        toast({
          title: "Could not load product",
          description: "Try again or open Products from the sidebar.",
          variant: "destructive",
        })
      }
    } finally {
      setEditLoadingId(null)
    }
  }

  const closeEditDialog = () => {
    setEditOpen(false)
    setEditingProduct(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={cn("text-3xl font-bold", themeClasses.mainText)}>{title}</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>{description}</p>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Temporary review pages — remove when the catalog cleanup is finished.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={wantCorrected ? "/dashboard/products/not-corrected" : "/dashboard/products/corrected"}>
              {wantCorrected ? "Open not corrected" : "Open corrected"}
            </Link>
          </Button>
        </div>
      </div>

      <Card className={cn(themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader>
          <CardTitle className={themeClasses.mainText}>
            Products ({sorted.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              Loading…
            </div>
          ) : sorted.length === 0 ? (
            <p className={cn("py-8 text-center text-sm", themeClasses.textNeutralSecondary)}>
              No products in this list.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", themeClasses.cardBorder)}>
                    <th className="w-12 py-3 pl-2 pr-2 text-left font-medium">OK</th>
                    <th className="py-3 px-2 text-left font-medium">Product</th>
                    <th className="hidden py-3 px-2 text-left font-medium sm:table-cell">SKU</th>
                    <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Price</th>
                    <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Qty</th>
                    <th className="py-3 px-2 text-right font-medium">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((product) => {
                    const row = product as Product & Record<string, unknown>
                    const checked = readReviewFlag(row)
                    const qty = readStockQty(row)
                    const isBusy = busyId === product.id
                    const editBusy = editLoadingId === product.id
                    return (
                      <tr key={product.id} className={cn("border-b", themeClasses.cardBorder)}>
                        <td className="py-2 pl-2 pr-2 align-middle">
                          <div className="flex items-center gap-2">
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                            <Checkbox
                              checked={checked}
                              disabled={isBusy}
                              onCheckedChange={(v) => {
                                const next = v === true
                                if (wantCorrected) {
                                  if (!next) void setFlag(product.id, false)
                                } else if (next) {
                                  void setFlag(product.id, true)
                                }
                              }}
                              aria-label={wantCorrected ? "Mark as not corrected" : "Mark as corrected"}
                            />
                          </div>
                        </td>
                        <td className="max-w-[220px] py-2 px-2 align-middle sm:max-w-md">
                          <div className="flex items-center gap-3">
                            {product.image ? (
                              <Image
                                src={product.image}
                                alt=""
                                width={40}
                                height={40}
                                className="h-10 w-10 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
                            )}
                            <span className="truncate font-medium">{product.name}</span>
                          </div>
                        </td>
                        <td className="hidden py-2 px-2 align-middle text-muted-foreground sm:table-cell">
                          {product.sku || "—"}
                        </td>
                        <td className="py-2 px-2 text-right align-middle tabular-nums font-medium">
                          {formatPrice(product.price ?? 0)}
                        </td>
                        <td className="py-2 px-2 text-right align-middle tabular-nums text-muted-foreground">
                          {qty !== null ? qty.toLocaleString() : "—"}
                        </td>
                        <td className="py-2 px-2 text-right align-middle">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={editBusy || isBusy}
                            onClick={() => void openEditDialog(product.id)}
                          >
                            {editBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Edit className="h-3.5 w-3.5" />
                            )}
                            Edit
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) closeEditDialog()
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          {editingProduct ? (
            <ProductForm
              key={editingProduct.id}
              product={editingProduct}
              autoCloseOnSave={false}
              onClose={closeEditDialog}
              onSave={async (productData) => {
                try {
                  const updatedFromApi = await updateProduct(editingProduct.id, productData)
                  toast({ title: "Product updated" })
                  await new Promise((r) => setTimeout(r, 200))
                  const refreshed = (await fetchFullProductDetails(editingProduct.id)) ?? updatedFromApi
                  const next = refreshed ?? updatedFromApi
                  if (next) {
                    setEditingProduct(next as Product)
                    setItems((prev) => prev.map((p) => (p.id === editingProduct.id ? { ...p, ...(next as object) } : p)))
                  }
                  return next
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Save failed"
                  toast({ title: "Error", description: msg, variant: "destructive" })
                  throw e
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
