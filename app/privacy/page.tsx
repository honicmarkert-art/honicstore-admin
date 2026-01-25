"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PrivacyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('return')

  const handleReturn = () => {
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      router.back()
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose">
            <p className="text-muted-foreground">
              Privacy Policy content will be displayed here.
            </p>
            <div className="mt-6">
              <Button onClick={handleReturn}>
                {returnUrl ? "Continue" : "Go Back"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
