"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"

export default function EnterProjectUsagePage() {
  const { themeClasses } = useTheme()
  const sp = useSearchParams()
  const clientName = String(sp.get("clientName") || "").trim()
  const [componentUsage, setComponentUsage] = useState(0)
  const [prototypeUsage, setPrototypeUsage] = useState(0)
  const [serviceUsed, setServiceUsed] = useState(0)
  const [componentNoteOpen, setComponentNoteOpen] = useState(false)
  const [prototypeNoteOpen, setPrototypeNoteOpen] = useState(false)
  const [serviceNoteOpen, setServiceNoteOpen] = useState(false)
  const [componentNote, setComponentNote] = useState("")
  const [prototypeNote, setPrototypeNote] = useState("")
  const [serviceNote, setServiceNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!clientName) {
      setError("Client name is required.")
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch("/api/admin/invoices/project-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientName,
          componentUsage,
          prototypeUsage,
          serviceUsed,
          componentNote,
          prototypeNote,
          serviceNote,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save usage")
      setMessage("Usage saved successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save usage.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Enter Project Usage</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            Save used amounts for component, prototype, and service for this client.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/projectdashboard/usage">Back to usage table</Link>
        </Button>
      </div>

      <Card className={cn("mx-auto w-full max-w-2xl", themeClasses.cardBg, themeClasses.cardBorder)}>
        <CardHeader><CardTitle className="text-base">Client: {clientName || "—"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-muted-foreground">Component usage amount</label>
              <Button type="button" variant="outline" size="sm" onClick={() => setComponentNoteOpen((v) => !v)}>
                {componentNoteOpen ? "Hide note" : "Add note"}
              </Button>
            </div>
            <Input type="number" min={0} value={componentUsage} onChange={(e) => setComponentUsage(Math.max(0, Number(e.target.value) || 0))} />
            {componentNoteOpen ? (
              <div className="mt-2 rounded-md border p-2">
                <Textarea
                  value={componentNote}
                  onChange={(e) => setComponentNote(e.target.value)}
                  rows={2}
                  placeholder="Component usage note..."
                />
              </div>
            ) : null}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-muted-foreground">Prototype usage amount</label>
              <Button type="button" variant="outline" size="sm" onClick={() => setPrototypeNoteOpen((v) => !v)}>
                {prototypeNoteOpen ? "Hide note" : "Add note"}
              </Button>
            </div>
            <Input type="number" min={0} value={prototypeUsage} onChange={(e) => setPrototypeUsage(Math.max(0, Number(e.target.value) || 0))} />
            {prototypeNoteOpen ? (
              <div className="mt-2 rounded-md border p-2">
                <Textarea
                  value={prototypeNote}
                  onChange={(e) => setPrototypeNote(e.target.value)}
                  rows={2}
                  placeholder="Prototype usage note..."
                />
              </div>
            ) : null}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-muted-foreground">Service used amount</label>
              <Button type="button" variant="outline" size="sm" onClick={() => setServiceNoteOpen((v) => !v)}>
                {serviceNoteOpen ? "Hide note" : "Add note"}
              </Button>
            </div>
            <Input type="number" min={0} value={serviceUsed} onChange={(e) => setServiceUsed(Math.max(0, Number(e.target.value) || 0))} />
            {serviceNoteOpen ? (
              <div className="mt-2 rounded-md border p-2">
                <Textarea
                  value={serviceNote}
                  onChange={(e) => setServiceNote(e.target.value)}
                  rows={2}
                  placeholder="Service usage note..."
                />
              </div>
            ) : null}
          </div>
          <div className="pt-1">
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save usage"}</Button>
          </div>
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
