"use client"

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, FileDown, ImagePlus, Plus, Printer, RotateCcw, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useToast } from "@/hooks/use-toast"
import {
  PSU_DIAGNOSTIC_REPORT,
  STAMP_PUBLIC_URL,
  type ReportSection,
  type TechnicalReportDefaults,
} from "@/lib/technical-report-defaults"

const INV = {
  blue: "#184a96",
  lineGray: "#cbd5e1",
  rowStripe: "#f8fafc",
}

const LOGO_STORAGE_KEY = "invoice-brand-logo"
const STAMP_STORAGE_KEY = "invoice-company-stamp"
const SIGNATURE_STORAGE_KEY = "invoice-digital-signature"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatLongDate(iso: string): string {
  if (!iso) return "—"
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

function statusColors(tone?: ReportSection["statusTone"]) {
  if (tone === "ok") return { bg: "#dcfce7", fg: "#166534", border: "#86efac" }
  if (tone === "warn") return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" }
  if (tone === "danger") return { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" }
  return { bg: "#f1f5f9", fg: "#334155", border: "#cbd5e1" }
}

function newSection(index: number): ReportSection {
  return {
    id: `sec-${Date.now()}-${index}`,
    title: `${index}. New section`,
    body: "",
    status: "",
    statusTone: "neutral",
  }
}

export default function TechnicalReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <h1 className="text-3xl font-bold tracking-tight">Technical Report Studio</h1>
          <p className="text-sm text-muted-foreground">Loading studio…</p>
        </div>
      }
    >
      <TechnicalReportsStudio />
    </Suspense>
  )
}

function TechnicalReportsStudio() {
  const { themeClasses } = useTheme()
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const savedId = searchParams.get("invoiceId") || searchParams.get("reportId")
  const mode = searchParams.get("mode")
  const isPreviewOnly = mode === "preview"

  const defaults = PSU_DIAGNOSTIC_REPORT
  const [reportNumber, setReportNumber] = useState(defaults.reportNumber)
  const [reportTitle, setReportTitle] = useState(defaults.reportTitle)
  const [toName, setToName] = useState(defaults.toName)
  const [toAddress, setToAddress] = useState(defaults.toAddress)
  const [fromName, setFromName] = useState(defaults.fromName)
  const [fromEmail, setFromEmail] = useState(defaults.fromEmail)
  const [fromPhone, setFromPhone] = useState(defaults.fromPhone)
  const [companyWebsite, setCompanyWebsite] = useState(defaults.companyWebsite)
  const [companyTagline, setCompanyTagline] = useState(defaults.companyTagline)
  const [footerPhone, setFooterPhone] = useState(defaults.footerPhone)
  const [footerEmail, setFooterEmail] = useState(defaults.footerEmail)
  const [footerAddress, setFooterAddress] = useState(defaults.footerAddress)
  const [reportDate, setReportDate] = useState(defaults.reportDate)
  const [machineName, setMachineName] = useState(defaults.machineName)
  const [subject, setSubject] = useState(defaults.subject)
  const [attachmentNote, setAttachmentNote] = useState(defaults.attachmentNote)
  const [nextSteps, setNextSteps] = useState(defaults.nextSteps)
  const [preparedByName, setPreparedByName] = useState(defaults.preparedByName)
  const [preparedByTitle, setPreparedByTitle] = useState(defaults.preparedByTitle)
  const [sections, setSections] = useState<ReportSection[]>(defaults.sections)
  const [invoiceLogo, setInvoiceLogo] = useState("")
  const [stampImage, setStampImage] = useState(STAMP_PUBLIC_URL)
  const [signatureImage, setSignatureImage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const stampInputRef = useRef<HTMLInputElement | null>(null)
  const signatureInputRef = useRef<HTMLInputElement | null>(null)

  const websiteDisplay = companyWebsite.replace(/^https?:\/\//i, "").toLowerCase()
  const websiteHref = /^https?:\/\//i.test(companyWebsite.trim())
    ? companyWebsite.trim()
    : `https://${websiteDisplay}`

  useEffect(() => {
    if (savedId) return
    try {
      const savedLogo = localStorage.getItem(LOGO_STORAGE_KEY)
      if (savedLogo) setInvoiceLogo(savedLogo)
      const savedSig = localStorage.getItem(SIGNATURE_STORAGE_KEY)
      if (savedSig) setSignatureImage(savedSig)
      const savedStamp = localStorage.getItem(STAMP_STORAGE_KEY)
      if (savedStamp) setStampImage(savedStamp)
    } catch {
      // ignore
    }
  }, [savedId])

  useEffect(() => {
    if (!savedId) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/admin/invoices/${savedId}`, { cache: "no-store", credentials: "include" })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load report")
        if (cancelled) return
        const inv = data.invoice as any
        const p = inv?.payload || {}
        setReportNumber(String(inv?.invoice_number || p.reportNumber || p.invoiceNumber || ""))
        setReportTitle(String(p.reportTitle || defaults.reportTitle))
        setToName(String(inv?.client_name || p.toName || p.clientName || ""))
        setToAddress(String(p.toAddress || p.clientAddress || ""))
        setFromName(String(p.fromName || defaults.fromName))
        setFromEmail(String(p.fromEmail || defaults.fromEmail))
        setFromPhone(String(p.fromPhone || defaults.fromPhone))
        setCompanyWebsite(String(p.companyWebsite || defaults.companyWebsite))
        setCompanyTagline(String(p.companyTagline || defaults.companyTagline))
        setFooterPhone(String(p.footerPhone || defaults.footerPhone))
        setFooterEmail(String(p.footerEmail || defaults.footerEmail))
        setFooterAddress(String(p.footerAddress || defaults.footerAddress))
        setReportDate(String(inv?.issue_date || p.reportDate || p.issueDate || ""))
        setMachineName(String(p.machineName || ""))
        setSubject(String(p.subject || ""))
        setAttachmentNote(String(p.attachmentNote || defaults.attachmentNote))
        setNextSteps(String(p.nextSteps || defaults.nextSteps))
        setPreparedByName(String(p.preparedByName || p.signerName || defaults.preparedByName))
        setPreparedByTitle(String(p.preparedByTitle || p.signerTitle || defaults.preparedByTitle))
        if (Array.isArray(p.sections) && p.sections.length) {
          setSections(
            p.sections.map((s: any, i: number) => ({
              id: String(s.id || `sec-${i}`),
              title: String(s.title || ""),
              body: String(s.body || ""),
              status: String(s.status || ""),
              statusTone: (s.statusTone as ReportSection["statusTone"]) || "neutral",
            }))
          )
        }
        if (typeof p.invoiceLogo === "string") setInvoiceLogo(p.invoiceLogo)
        if (typeof p.stampImage === "string") setStampImage(p.stampImage)
        if (typeof p.signatureImage === "string") setSignatureImage(p.signatureImage)
      } catch (e) {
        toast({
          title: "Load failed",
          description: e instanceof Error ? e.message : "Could not load report.",
          variant: "destructive",
        })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [savedId, toast, defaults])

  const uploadAsset = async (file: File, kind: "logo" | "signature" | "stamp") => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.readAsDataURL(file)
    })
    const res = await fetch("/api/admin/invoices/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind, filename: file.name, dataUrl }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.url) throw new Error(data?.error || "Upload failed")
    return String(data.url)
  }

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadAsset(file, "logo")
      setInvoiceLogo(url)
      localStorage.setItem(LOGO_STORAGE_KEY, url)
    } catch (err) {
      toast({ title: "Logo upload failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
    }
    e.target.value = ""
  }

  const handleStampUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadAsset(file, "stamp")
      setStampImage(url)
      localStorage.setItem(STAMP_STORAGE_KEY, url)
    } catch (err) {
      toast({ title: "Stamp upload failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
    }
    e.target.value = ""
  }

  const handleSignatureUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadAsset(file, "signature")
      setSignatureImage(url)
      localStorage.setItem(SIGNATURE_STORAGE_KEY, url)
    } catch (err) {
      toast({ title: "Signature upload failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
    }
    e.target.value = ""
  }

  const updateSection = (id: string, patch: Partial<ReportSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const addSection = () => setSections((prev) => [...prev, newSection(prev.length + 1)])
  const removeSection = (id: string) => setSections((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))

  const buildPayload = () => ({
    documentKind: "technical_report",
    dashboardScope: "main",
    invoiceId: savedId || undefined,
    invoiceNumber: reportNumber,
    reportNumber,
    reportTitle,
    clientName: toName.trim() || "Client",
    clientAddress: toAddress,
    toName,
    toAddress,
    fromName,
    fromEmail,
    fromPhone,
    companyWebsite,
    companyTagline,
    footerPhone,
    footerEmail,
    footerAddress,
    issueDate: reportDate,
    reportDate,
    machineName,
    subject,
    attachmentNote,
    nextSteps,
    preparedByName,
    preparedByTitle,
    signerName: preparedByName,
    signerTitle: preparedByTitle,
    sections,
    invoiceLogo,
    stampImage,
    signatureImage,
    currency: "TZS",
    totals: { subtotal: 0, taxAmount: 0, grandTotal: 0 },
  })

  const saveReport = async (silent = false) => {
    if (!toName.trim()) {
      toast({ title: "Client required", description: "Enter who the report is addressed to.", variant: "destructive" })
      return null
    }
    setIsSaving(true)
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.details || "Failed to save report")
      if (data?.invoice?.invoice_number) setReportNumber(String(data.invoice.invoice_number))
      const nextId = String(data?.invoice?.id || "")
      if (!savedId && nextId) {
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.set("invoiceId", nextId)
        if (!nextParams.get("mode")) nextParams.set("mode", "edit")
        router.replace(`${pathname}?${nextParams.toString()}`)
      }
      if (!silent) {
        toast({
          title: "Report saved",
          description: `${String(data?.invoice?.invoice_number || reportNumber)} saved.`,
        })
      }
      return data?.invoice
    } catch (e) {
      if (!silent) {
        toast({
          title: "Save failed",
          description: e instanceof Error ? e.message : "Could not save report.",
          variant: "destructive",
        })
      }
      return null
    } finally {
      setIsSaving(false)
    }
  }

  const sectionsHtml = useMemo(
    () =>
      sections
        .map((sec) => {
          const tone = statusColors(sec.statusTone)
          const statusHtml = sec.status?.trim()
            ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};vertical-align:middle;">${escapeHtml(sec.status.trim())}</span>`
            : ""
          return `
            <section style="margin:0 0 18px;">
              <h3 style="margin:0 0 8px;font-size:13px;font-weight:800;color:#0f172a;letter-spacing:0.02em;">
                ${escapeHtml(sec.title)}${statusHtml}
              </h3>
              <p style="margin:0;font-size:12px;line-height:1.65;color:#334155;white-space:pre-line;">${escapeHtml(sec.body || "—")}</p>
            </section>`
        })
        .join(""),
    [sections]
  )

  const downloadPdf = async () => {
    if (!isPreviewOnly) {
      const saved = await saveReport(true)
      if (!saved && !savedId) return
    }
    const logoHtml = invoiceLogo
      ? `<img src="${invoiceLogo}" alt="" style="height:64px;max-width:120px;object-fit:contain;" />`
      : `<div style="height:56px;width:56px;border-radius:50%;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:9px;color:#9ca3af;">Logo</div>`
    const stampHtml = stampImage
      ? `<img src="${stampImage}" alt="" style="max-height:120px;max-width:220px;object-fit:contain;margin-top:10px;" />`
      : ""
    const sigHtml = signatureImage
      ? `<img src="${signatureImage}" alt="" style="height:48px;max-width:160px;object-fit:contain;margin:6px 0;" />`
      : ""

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(reportNumber)}.pdf</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { margin:0; font-family: "Segoe UI", Arial, sans-serif; color:#0f172a; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .wrap { max-width:780px; margin:0 auto; }
        .head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
        .co { font-size:16px; font-weight:800; }
        .tag { font-size:10px; letter-spacing:0.12em; color:#64748b; font-weight:700; margin-top:2px; }
        .title { font-size:20px; font-weight:900; letter-spacing:0.04em; color:${INV.blue}; text-align:right; }
        .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:18px; }
        .label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
        .value { font-size:13px; font-weight:700; margin-top:4px; }
        .muted { font-size:11px; color:#64748b; white-space:pre-line; margin-top:4px; }
        .line { height:1px; background:${INV.lineGray}; margin:14px 0 4px; position:relative; }
        .line:after { content:""; position:absolute; left:0; top:0; height:3px; width:96px; background:${INV.blue}; }
        .attach { margin:16px 0; padding:12px 14px; border-left:4px solid ${INV.blue}; background:#f8fafc; font-size:12px; line-height:1.55; color:#334155; }
        .attach strong { display:block; margin-bottom:4px; color:#0f172a; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; }
        .sign { text-align:right; margin-top:28px; }
        .url { text-align:right; font-size:9px; font-weight:600; margin-top:6px; }
        .url a { color:#475569; text-decoration:none; }
      </style></head><body>
      <div class="wrap">
        <div class="head">
          <div style="display:flex;gap:12px;align-items:center;">
            ${logoHtml}
            <div>
              <div class="co">${escapeHtml(fromName)}</div>
              <div class="tag">${escapeHtml(companyTagline)}</div>
              <div class="muted">${escapeHtml(fromEmail)} · ${escapeHtml(fromPhone)}</div>
            </div>
          </div>
          <div>
            <div class="title">TECHNICAL REPORT</div>
            <div style="text-align:right;font-size:12px;font-weight:800;margin-top:6px;">${escapeHtml(reportNumber)}</div>
            <div style="text-align:right;font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(formatLongDate(reportDate))}</div>
          </div>
        </div>
        <div class="line"></div>
        <div class="url"><a href="${escapeHtml(websiteHref)}">${escapeHtml(websiteDisplay)}</a></div>
        <div class="meta-grid">
          <div>
            <div class="label">To</div>
            <div class="value">${escapeHtml(toName || "Client")}</div>
            ${toAddress.trim() ? `<div class="muted">${escapeHtml(toAddress.trim())}</div>` : ""}
          </div>
          <div>
            <div class="label">Machine / Equipment</div>
            <div class="value">${escapeHtml(machineName || "—")}</div>
            <div class="label" style="margin-top:10px;">Subject</div>
            <div class="value" style="font-size:12px;font-weight:600;">${escapeHtml(subject || "—")}</div>
          </div>
        </div>
        <h2 style="margin:22px 0 14px;font-size:14px;font-weight:900;letter-spacing:0.04em;color:#0f172a;">${escapeHtml(reportTitle)}</h2>
        ${sectionsHtml}
        <div class="attach">
          <strong>Attachment</strong>
          ${escapeHtml(attachmentNote)}
        </div>
        <section style="margin:18px 0;">
          <h3 style="margin:0 0 8px;font-size:13px;font-weight:800;">Next Steps</h3>
          <p style="margin:0;font-size:12px;line-height:1.65;color:#334155;white-space:pre-line;">${escapeHtml(nextSteps)}</p>
        </section>
        <div class="sign">
          <div style="font-size:11px;color:#64748b;">Report prepared by</div>
          <div style="font-family:Georgia,serif;font-style:italic;font-size:16px;margin-top:4px;">${escapeHtml(preparedByName)}</div>
          ${sigHtml}
          <div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(preparedByTitle)}</div>
          <div style="font-size:11px;font-weight:700;margin-top:2px;">${escapeHtml(fromName)}</div>
          ${stampHtml}
        </div>
        <div class="line" style="margin-top:28px;"></div>
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#64748b;margin-top:10px;">
          <span>${escapeHtml(footerPhone)}</span>
          <span>${escapeHtml(footerEmail)}</span>
          <span>${escapeHtml(footerAddress)}</span>
        </div>
      </div>
      </body></html>`

    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
    window.setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      window.setTimeout(() => iframe.remove(), 1000)
    }, 400)
  }

  const loadPsuTemplate = () => {
    const d: TechnicalReportDefaults = PSU_DIAGNOSTIC_REPORT
    setReportTitle(d.reportTitle)
    setSubject(d.subject)
    setAttachmentNote(d.attachmentNote)
    setNextSteps(d.nextSteps)
    setSections(d.sections.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` })))
    toast({ title: "Template loaded", description: "PSU diagnostic & repair report content applied." })
  }

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Technical Report Studio</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            Create and edit diagnostic and repair reports. Company details are editable; attach the proforma invoice separately.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/technical-reports/list" className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Saved Reports
            </Link>
          </Button>
          {!isPreviewOnly ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={loadPsuTemplate}>
                Load PSU template
              </Button>
              <Button type="button" size="sm" onClick={() => saveReport(false)} disabled={isSaving || isLoading}>
                {isSaving ? "Saving…" : "Save Report"}
              </Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={downloadPdf}>
            <FileDown className="h-3.5 w-3.5" />
            Download PDF
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {!isPreviewOnly ? (
          <Card className={cn("lg:col-span-5", themeClasses.cardBg, themeClasses.cardBorder)}>
            <CardHeader>
              <CardTitle className="text-base">Edit report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Report #</label>
                  <Input value={reportNumber} onChange={(e) => setReportNumber(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Report title</label>
                <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Machine / Equipment</label>
                <Input
                  value={machineName}
                  onChange={(e) => setMachineName(e.target.value)}
                  placeholder="Machine name or model"
                />
              </div>

              <div className="rounded-lg border border-border/70 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Company (From)</p>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Company name" />
                <Input value={companyTagline} onChange={(e) => setCompanyTagline(e.target.value)} placeholder="Tagline" />
                <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="Email" />
                <Input value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} placeholder="Phone" />
                <Input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="Website" />
                <div className="flex flex-wrap gap-2">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => logoInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" /> Logo
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setInvoiceLogo("")} disabled={!invoiceLogo}>
                    <RotateCcw className="h-3.5 w-3.5" /> Clear
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Client (To)</p>
                <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Client / management" />
                <Textarea value={toAddress} onChange={(e) => setToAddress(e.target.value)} placeholder="Address" rows={3} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Sections</p>
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addSection}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                {sections.map((sec) => (
                  <div key={sec.id} className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-2">
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        value={sec.title}
                        onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                        placeholder="Section title"
                      />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeSection(sec.id)} aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={sec.status || ""}
                        onChange={(e) => updateSection(sec.id, { status: e.target.value })}
                        placeholder="Status chip (optional)"
                      />
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={sec.statusTone || "neutral"}
                        onChange={(e) =>
                          updateSection(sec.id, {
                            statusTone: e.target.value as ReportSection["statusTone"],
                          })
                        }
                      >
                        <option value="neutral">Neutral</option>
                        <option value="ok">OK / Working</option>
                        <option value="warn">Warn / Repairable</option>
                        <option value="danger">Danger / Failed</option>
                      </select>
                    </div>
                    <Textarea
                      value={sec.body}
                      onChange={(e) => updateSection(sec.id, { body: e.target.value })}
                      rows={4}
                      placeholder="Section body"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Proforma attachment note</label>
                <Textarea value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} rows={3} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Next steps</label>
                <Textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={4} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Prepared by</label>
                  <Input value={preparedByName} onChange={(e) => setPreparedByName(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Title / role</label>
                  <Input value={preparedByTitle} onChange={(e) => setPreparedByTitle(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-dashed p-2">
                  <p className="mb-1.5 text-xs text-muted-foreground">Signature</p>
                  <input ref={signatureInputRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => signatureInputRef.current?.click()}>
                      Upload
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSignatureImage("")} disabled={!signatureImage}>
                      Clear
                    </Button>
                  </div>
                  {signatureImage ? <img src={signatureImage} alt="" className="mt-2 h-12 object-contain" /> : null}
                </div>
                <div className="rounded-lg border border-dashed p-2">
                  <p className="mb-1.5 text-xs text-muted-foreground">Company stamp</p>
                  <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => stampInputRef.current?.click()}>
                      Upload
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setStampImage("")} disabled={!stampImage}>
                      Clear
                    </Button>
                  </div>
                  {stampImage ? <img src={stampImage} alt="" className="mt-2 h-16 object-contain" /> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Input value={footerPhone} onChange={(e) => setFooterPhone(e.target.value)} placeholder="Footer phone" />
                <Input value={footerEmail} onChange={(e) => setFooterEmail(e.target.value)} placeholder="Footer email" />
                <Input value={footerAddress} onChange={(e) => setFooterAddress(e.target.value)} placeholder="Footer address" />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card
          key={savedId || "new-report"}
          className={cn("print:shadow-none", isPreviewOnly ? "lg:col-span-12" : "lg:col-span-7", themeClasses.cardBg, themeClasses.cardBorder)}
        >
          <CardHeader className="print:hidden">
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("mx-auto max-w-3xl bg-white text-slate-900 shadow-sm print:shadow-none", isLoading && "opacity-60")}>
              <div className="px-6 pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    {invoiceLogo ? (
                      <img src={invoiceLogo} alt="" className="h-16 w-auto max-w-[120px] object-contain" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-[9px] text-slate-400">
                        Logo
                      </div>
                    )}
                    <div>
                      <p className="text-base font-extrabold">{fromName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{companyTagline}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {fromEmail} · {fromPhone}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xl font-black tracking-wide" style={{ color: INV.blue }}>
                      TECHNICAL REPORT
                    </p>
                    <p className="mt-1 text-sm font-extrabold">{reportNumber}</p>
                    <p className="text-xs text-slate-500">{formatLongDate(reportDate)}</p>
                  </div>
                </div>
                <div className="relative mt-4">
                  <div className="h-px w-full" style={{ background: INV.lineGray }} />
                  <div className="absolute left-0 top-0 h-[3px] w-24" style={{ background: INV.blue }} />
                  <p className="pt-1.5 text-right text-[10px] font-semibold text-slate-600">
                    <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {websiteDisplay}
                    </a>
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">To</p>
                    <p className="mt-1 text-[15px] font-extrabold">{toName || "Client"}</p>
                    {toAddress.trim() ? (
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{toAddress.trim()}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Machine / Equipment</p>
                    <p className="mt-1 text-sm font-bold">{machineName || "—"}</p>
                    <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Subject</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{subject || "—"}</p>
                  </div>
                </div>

                <h2 className="mt-6 text-sm font-black tracking-wide text-slate-900">{reportTitle}</h2>

                <div className="mt-4 space-y-5">
                  {sections.map((sec) => {
                    const tone = statusColors(sec.statusTone)
                    return (
                      <section key={sec.id}>
                        <h3 className="text-[13px] font-extrabold text-slate-900">
                          {sec.title}
                          {sec.status?.trim() ? (
                            <span
                              className="ml-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold align-middle"
                              style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}
                            >
                              {sec.status.trim()}
                            </span>
                          ) : null}
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{sec.body || "—"}</p>
                      </section>
                    )
                  })}
                </div>

                <div className="mt-6 border-l-4 bg-slate-50 px-4 py-3" style={{ borderColor: INV.blue }}>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-800">Attachment</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{attachmentNote}</p>
                </div>

                <section className="mt-6">
                  <h3 className="text-[13px] font-extrabold text-slate-900">Next Steps</h3>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{nextSteps}</p>
                </section>

                <div className="mt-8 pb-2 text-right">
                  <p className="text-[10px] text-slate-500">Report prepared by</p>
                  <p className="mt-1 font-['Georgia',serif] text-lg italic text-slate-700">{preparedByName}</p>
                  {signatureImage ? (
                    <img src={signatureImage} alt="" className="ml-auto mt-2 block h-12 max-w-[160px] object-contain" />
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">{preparedByTitle}</p>
                  <p className="text-xs font-bold text-slate-800">{fromName}</p>
                  {stampImage ? (
                    <img
                      src={stampImage}
                      alt=""
                      className="ml-auto mt-3 block h-28 w-auto max-w-[220px] object-contain opacity-95"
                    />
                  ) : null}
                </div>

                <div className="relative mt-6 pb-5">
                  <div className="h-px w-full" style={{ background: INV.lineGray }} />
                  <div className="absolute right-0 top-0 h-[3px] w-24" style={{ background: INV.blue }} />
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
                    <span>{footerPhone}</span>
                    <span>{footerEmail}</span>
                    <span>{footerAddress}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
