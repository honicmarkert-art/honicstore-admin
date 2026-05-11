"use client"

import { SecurityGuard } from "@/components/security-guard"
import { ProductReviewQueue } from "@/components/product-review-queue"

export default function NotCorrectedProductsPage() {
  return (
    <SecurityGuard requireAuth={true} requireAdmin={true}>
      <ProductReviewQueue mode="not-corrected" />
    </SecurityGuard>
  )
}
