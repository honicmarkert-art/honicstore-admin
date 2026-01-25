"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function EmailsPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to abandoned-carts by default
    router.push('/dashboard/emails/abandoned-carts')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  )
}
