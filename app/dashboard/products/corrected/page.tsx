"use client"

import { SecurityGuard } from "@/components/security-guard"
import { ProductReviewQueue } from "@/components/product-review-queue"

export default function CorrectedProductsPage() {
  return (
    <SecurityGuard requireAuth={true} requireAdmin={true}>
      <ProductReviewQueue mode="corrected" />
    </SecurityGuard>
  )
}
