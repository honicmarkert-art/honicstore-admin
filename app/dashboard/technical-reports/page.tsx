"use client"

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
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
  TSP_XRAY_PSU_REPORT,
  STAMP_PUBLIC_URL,
  SIGNATURE_PUBLIC_URL,
  type ReportSection,
  type TechnicalReportDefaults,
} from "@/lib/technical-report-defaults"

const INV = {
  blue: "#184a96",
  lineGray: "#cbd5e1",
  ink: "#0f172a",
  muted: "#64748b",
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

/** Convert **bold** and *italic* markers to HTML (after escaping). */
function convertInlineMarkupToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
}

/** Convert **bold** and *italic* markers to React nodes for live preview. */
function renderInlineMarkup(text: string): ReactNode {
  if (!text) return "—"
  const nodes: ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[2] != null) {
      nodes.push(<strong key={`b-${key++}`}>{match[2]}</strong>)
    } else if (match[3] != null) {
      nodes.push(<em key={`i-${key++}`}>{match[3]}</em>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : text
}

function wrapSelectionMarkup(
  value: string,
  start: number,
  end: number,
  marker: "**" | "*",
  emptyLabel: string
): { next: string; caretStart: number; caretEnd: number } {
  const selected = value.slice(start, end)
  const wrapped = `${marker}${selected || emptyLabel}${marker}`
  const next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`
  const caretStart = start + marker.length
  const caretEnd = start + wrapped.length - marker.length
  return { next, caretStart, caretEnd }
}

function formatLongDate(iso: string): string {
  if (!iso) return "—"
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

function newSection(index: number): ReportSection {
  return {
    id: `sec-${Date.now()}-${index}`,
    title: `${index}. New section`,
    body: "",
    status: "",
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

  const defaults = TSP_XRAY_PSU_REPORT
  const [reportNumber, setReportNumber] = useState(defaults.reportNumber)
  const [reportTitle, setReportTitle] = useState(defaults.reportTitle)
  const [documentRevision, setDocumentRevision] = useState(defaults.documentRevision)
  const [confidentiality, setConfidentiality] = useState(defaults.confidentiality)
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
  const [serialNumber, setSerialNumber] = useState(defaults.serialNumber)
  const [application, setApplication] = useState(defaults.application)
  const [subject, setSubject] = useState(defaults.subject)
  const [problemDescription, setProblemDescription] = useState(defaults.problemDescription)
  const [closureNote, setClosureNote] = useState(defaults.closureNote)
  const [preparedByName, setPreparedByName] = useState(defaults.preparedByName)
  const [preparedByTitle, setPreparedByTitle] = useState(defaults.preparedByTitle)
  const [sections, setSections] = useState<ReportSection[]>(defaults.sections)
  const [invoiceLogo, setInvoiceLogo] = useState("")
  const [stampImage, setStampImage] = useState(STAMP_PUBLIC_URL)
  const [signatureImage, setSignatureImage] = useState(SIGNATURE_PUBLIC_URL)
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
        setDocumentRevision(String(p.documentRevision || defaults.documentRevision))
        setConfidentiality(String(p.confidentiality || defaults.confidentiality))
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
        setSerialNumber(String(p.serialNumber || ""))
        setApplication(String(p.application || ""))
        setSubject(String(p.subject || ""))
        const problemFromLegacySection = Array.isArray(p.sections)
          ? p.sections.find((s: any) => String(s.title || "").toLowerCase().includes("problem description"))
          : null
        setProblemDescription(
          String(
            p.problemDescription ||
              problemFromLegacySection?.body ||
              defaults.problemDescription
          )
        )
        const legacyClosure = [p.attachmentNote, p.nextSteps].filter(Boolean).join("\n\n")
        setClosureNote(String(p.closureNote || legacyClosure || defaults.closureNote))
        setPreparedByName(String(p.preparedByName || p.signerName || defaults.preparedByName))
        setPreparedByTitle(String(p.preparedByTitle || p.signerTitle || defaults.preparedByTitle))
        if (Array.isArray(p.sections) && p.sections.length) {
          // Drop duplicated closing / problem sections if older drafts still contain them
          const filtered = p.sections.filter((s: any) => {
            const t = String(s.title || "").toLowerCase()
            return (
              !t.includes("commercial attachment") &&
              !t.includes("next steps") &&
              !t.includes("problem description")
            )
          })
          setSections(
            (filtered.length ? filtered : p.sections).map((s: any, i: number) => ({
              id: String(s.id || `sec-${i}`),
              title: String(s.title || ""),
              body: String(s.body || ""),
              status: String(s.status || ""),
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

  const applyMarkupShortcut = (
    e: KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    onChange: (next: string) => void
  ) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const key = e.key.toLowerCase()
    if (key !== "b" && key !== "i") return
    e.preventDefault()
    const el = e.currentTarget
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const marker = key === "b" ? "**" : "*"
    const emptyLabel = key === "b" ? "bold text" : "italic text"
    const { next, caretStart, caretEnd } = wrapSelectionMarkup(value, start, end, marker, emptyLabel)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caretStart, caretEnd)
    })
  }

  const buildPayload = () => ({
    documentKind: "technical_report",
    dashboardScope: "main",
    invoiceId: savedId || undefined,
    invoiceNumber: reportNumber,
    reportNumber,
    reportTitle,
    documentRevision,
    confidentiality,
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
    serialNumber,
    application,
    subject,
    problemDescription,
    closureNote,
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
          const statusHtml = sec.status?.trim()
            ? `<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${INV.blue};">${escapeHtml(sec.status.trim())}</p>`
            : ""
          return `
            <section style="margin:0 0 16px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;">
              <h3 style="margin:0 0 6px;font-size:12px;font-weight:800;color:#0f172a;letter-spacing:0.04em;text-transform:uppercase;">
                ${escapeHtml(sec.title)}
              </h3>
              ${statusHtml}
              <p style="margin:0;font-size:12px;line-height:1.7;color:#334155;white-space:pre-line;">${convertInlineMarkupToHtml(sec.body || "—")}</p>
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
      ? `<img src="${invoiceLogo}" alt="" style="height:56px;max-width:110px;object-fit:contain;" />`
      : ""
    const stampHtml = stampImage
      ? `<img src="${stampImage}" alt="" style="max-height:110px;max-width:200px;object-fit:contain;margin-top:8px;" />`
      : ""
    const sigHtml = signatureImage
      ? `<img src="${signatureImage}" alt="" style="height:44px;max-width:150px;object-fit:contain;margin:6px 0;" />`
      : ""

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(reportNumber)}.pdf</title>
      <style>
        @page { size: A4; margin: 16mm 14mm 18mm; }
        body { margin:0; font-family: "Segoe UI", Calibri, Arial, sans-serif; color:#0f172a; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .wrap { max-width:780px; margin:0 auto; }
        .band { height:4px; background:${INV.blue}; }
        .head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:14px 0 10px; }
        .co { font-size:15px; font-weight:800; letter-spacing:0.01em; }
        .tag { font-size:9px; letter-spacing:0.14em; color:#64748b; font-weight:700; margin-top:3px; text-transform:uppercase; }
        .doc-type { font-size:18px; font-weight:900; letter-spacing:0.08em; color:${INV.blue}; text-align:right; }
        .meta-table, .equip-table { width:100%; border-collapse:collapse; margin-top:12px; font-size:11px; }
        .meta-table td, .equip-table td { border:1px solid #cbd5e1; padding:7px 9px; vertical-align:top; }
        .meta-table .k, .equip-table .k { width:28%; background:#f8fafc; font-weight:700; color:#334155; text-transform:uppercase; letter-spacing:0.04em; font-size:9px; }
        .subject { margin:14px 0 6px; padding:10px 12px; border:1px solid #cbd5e1; background:#fff; }
        .subject .k { font-size:9px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; }
        .subject .v { margin-top:4px; font-size:13px; font-weight:700; color:#0f172a; }
        .problem { margin:8px 0 6px; padding:10px 12px; border:1px solid #cbd5e1; background:#fff; }
        .problem .k { font-size:9px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; }
        .problem .v { margin-top:4px; font-size:12px; line-height:1.65; color:#334155; white-space:pre-line; }
        .body-title { margin:18px 0 12px; font-size:13px; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; color:#0f172a; border-bottom:2px solid ${INV.blue}; padding-bottom:6px; }
        .closure { margin-top:8px; border:1px solid #cbd5e1; }
        .closure-h { background:#184a96; color:#fff; font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; padding:8px 12px; }
        .closure-b { padding:12px; font-size:12px; line-height:1.65; color:#334155; white-space:pre-line; }
        .sign { margin-top:28px; display:grid; grid-template-columns:1fr 1fr; gap:24px; }
        .sign .box { border-top:1px solid #94a3b8; padding-top:10px; }
        .sign .lbl { font-size:9px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; }
        .footer { margin-top:28px; border-top:2px solid ${INV.blue}; padding-top:10px; }
        .footer-row { display:flex; justify-content:space-between; gap:10px; font-size:9px; color:#64748b; }
        .conf { margin-top:6px; font-size:9px; font-style:italic; color:#64748b; }
        .url { text-align:right; font-size:9px; font-weight:600; margin-top:4px; }
        .url a { color:#475569; text-decoration:none; }
      </style></head><body>
      <div class="wrap">
        <div class="band"></div>
        <div class="head">
          <div style="display:flex;gap:12px;align-items:center;">
            ${logoHtml}
            <div>
              <div class="co">${escapeHtml(fromName)}</div>
              <div class="tag">${escapeHtml(companyTagline)}</div>
              <div style="font-size:10px;color:#64748b;margin-top:4px;">${escapeHtml(fromEmail)} · ${escapeHtml(fromPhone)}</div>
            </div>
          </div>
          <div>
            <div class="doc-type">TECHNICAL REPORT</div>
            <div class="url"><a href="${escapeHtml(websiteHref)}">${escapeHtml(websiteDisplay)}</a></div>
          </div>
        </div>
        <table class="meta-table">
          <tr><td class="k">Document no.</td><td>${escapeHtml(reportNumber)}</td><td class="k">Date</td><td>${escapeHtml(formatLongDate(reportDate))}</td></tr>
          <tr><td class="k">Revision</td><td>${escapeHtml(documentRevision || "Rev. 00")}</td><td class="k">Pages</td><td>As printed</td></tr>
        </table>
        <table class="equip-table">
          <tr><td class="k">Prepared for</td><td><strong>${escapeHtml(toName || "Client")}</strong>${toAddress.trim() ? `<div style="margin-top:4px;white-space:pre-line;color:#64748b;font-size:10px;">${escapeHtml(toAddress.trim())}</div>` : ""}</td></tr>
          <tr><td class="k">Inspection system</td><td>${escapeHtml(machineName || "—")}</td></tr>
          <tr><td class="k">Serial number</td><td>${escapeHtml(serialNumber || "—")}</td></tr>
          <tr><td class="k">Application</td><td>${escapeHtml(application || "—")}</td></tr>
        </table>
        <div class="subject">
          <div class="k">Subject</div>
          <div class="v">${escapeHtml(subject || "—")}</div>
        </div>
        <div class="problem">
          <div class="k">Problem Description</div>
          <div class="v">${convertInlineMarkupToHtml(problemDescription || "—")}</div>
        </div>
        <div class="body-title">${escapeHtml(reportTitle)}</div>
        ${sectionsHtml}
        <div class="closure">
          <div class="closure-h">Document closure — attachment &amp; approval</div>
          <div class="closure-b">${convertInlineMarkupToHtml(closureNote)}</div>
        </div>
        <div class="sign">
          <div class="box">
            <div class="lbl">Prepared by</div>
            <div style="font-family:Georgia,serif;font-style:italic;font-size:15px;margin-top:8px;">${escapeHtml(preparedByName)}</div>
            ${sigHtml}
            <div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(preparedByTitle)}</div>
            <div style="font-size:11px;font-weight:700;">${escapeHtml(fromName)}</div>
          </div>
          <div class="box" style="text-align:right;">
            <div class="lbl">Company authorisation</div>
            ${stampHtml}
          </div>
        </div>
        <div class="footer">
          <div class="footer-row">
            <span>${escapeHtml(footerPhone)}</span>
            <span>${escapeHtml(footerEmail)}</span>
            <span>${escapeHtml(footerAddress)}</span>
          </div>
          <div class="conf">${escapeHtml(confidentiality)}</div>
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

  const loadTspTemplate = () => {
    const d: TechnicalReportDefaults = TSP_XRAY_PSU_REPORT
    setReportTitle(d.reportTitle)
    setDocumentRevision(d.documentRevision)
    setConfidentiality(d.confidentiality)
    setToName(d.toName)
    setToAddress(d.toAddress)
    setSubject(d.subject)
    setProblemDescription(d.problemDescription)
    setMachineName(d.machineName)
    setSerialNumber(d.serialNumber)
    setApplication(d.application)
    setClosureNote(d.closureNote)
    setSections(d.sections.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` })))
    setSignatureImage(SIGNATURE_PUBLIC_URL)
    setStampImage(STAMP_PUBLIC_URL)
    toast({ title: "Template loaded", description: "TSP X-ray PSU diagnostic report applied." })
  }

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Technical Report Studio</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            Formal diagnostic reports for clients. Proforma invoice attaches separately — not repeated in the body.
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
              <Button type="button" size="sm" variant="outline" onClick={loadTspTemplate}>
                Load TSP X-ray template
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
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Document no.</label>
                  <Input value={reportNumber} onChange={(e) => setReportNumber(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Revision</label>
                  <Input value={documentRevision} onChange={(e) => setDocumentRevision(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Confidentiality line</label>
                  <Input value={confidentiality} onChange={(e) => setConfidentiality(e.target.value)} />
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
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Problem description (as reported by TSP)
                </label>
                <Textarea
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  onKeyDown={(e) => applyMarkupShortcut(e, problemDescription, setProblemDescription)}
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Inspection system</label>
                <Input value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="e.g. ANDREX SMART 583" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Serial number</label>
                  <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Application</label>
                  <Input value={application} onChange={(e) => setApplication(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Company (From)</p>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
                <Input value={companyTagline} onChange={(e) => setCompanyTagline(e.target.value)} />
                <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
                <Input value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} />
                <Input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} />
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

              <div className="space-y-3 rounded-lg border border-border/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Prepared for (Client)</p>
                <Input value={toName} onChange={(e) => setToName(e.target.value)} />
                <Textarea value={toAddress} onChange={(e) => setToAddress(e.target.value)} rows={4} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Body sections</p>
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addSection}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use Ctrl+B for bold, Ctrl+I for italic in section body. Problem description sits above — do not repeat it here. Use Document closure once for attachment / approval.
                </p>
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
                    <Input
                      value={sec.status || ""}
                      onChange={(e) => updateSection(sec.id, { status: e.target.value })}
                      placeholder='Optional status line, e.g. "Status: Working within specification"'
                    />
                    <Textarea
                      value={sec.body}
                      onChange={(e) => updateSection(sec.id, { body: e.target.value })}
                      onKeyDown={(e) =>
                        applyMarkupShortcut(e, sec.body, (next) => updateSection(sec.id, { body: next }))
                      }
                      rows={4}
                      placeholder="Section body (Ctrl+B bold, Ctrl+I italic)"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Document closure (attachment + approval — single block)
                </label>
                <Textarea
                  value={closureNote}
                  onChange={(e) => setClosureNote(e.target.value)}
                  onKeyDown={(e) => applyMarkupShortcut(e, closureNote, setClosureNote)}
                  rows={5}
                />
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
            <div className={cn("mx-auto max-w-3xl bg-white text-slate-900 shadow-sm print:max-w-none print:shadow-none", isLoading && "opacity-60")}>
              <div className="h-1 w-full" style={{ background: INV.blue }} />
              <div className="px-6 pt-5 pb-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    {invoiceLogo ? (
                      <img src={invoiceLogo} alt="" className="h-14 w-auto max-w-[110px] object-contain" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center border border-dashed border-slate-300 text-[9px] text-slate-400">
                        Logo
                      </div>
                    )}
                    <div>
                      <p className="text-[15px] font-extrabold tracking-tight">{fromName}</p>
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{companyTagline}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {fromEmail} · {fromPhone}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-black tracking-[0.08em]" style={{ color: INV.blue }}>
                      TECHNICAL REPORT
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-600">
                      <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {websiteDisplay}
                      </a>
                    </p>
                  </div>
                </div>

                <table className="mt-4 w-full border-collapse text-[11px]">
                  <tbody>
                    <tr>
                      <td className="w-[22%] border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Document no.
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">{reportNumber}</td>
                      <td className="w-[14%] border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Date
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{formatLongDate(reportDate)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Revision
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{documentRevision || "Rev. 00"}</td>
                      <td className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Type
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">Diagnostic &amp; repair</td>
                    </tr>
                  </tbody>
                </table>

                <table className="mt-3 w-full border-collapse text-[11px]">
                  <tbody>
                    <tr>
                      <td className="w-[28%] border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Prepared for
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">
                        <p className="font-bold">{toName || "Client"}</p>
                        {toAddress.trim() ? (
                          <p className="mt-1 whitespace-pre-line text-[10px] text-slate-500">{toAddress.trim()}</p>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Inspection system
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">{machineName || "—"}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Serial number
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{serialNumber || "—"}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                        Application
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{application || "—"}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-3 border border-slate-300 px-3 py-2.5">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Subject</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{subject || "—"}</p>
                </div>

                <div className="mt-2 border border-slate-300 px-3 py-2.5">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    Problem Description
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-700">
                    {renderInlineMarkup(problemDescription || "—")}
                  </p>
                </div>

                <h2
                  className="mt-5 border-b-2 pb-1.5 text-[12px] font-black uppercase tracking-[0.06em] text-slate-900"
                  style={{ borderColor: INV.blue }}
                >
                  {reportTitle}
                </h2>

                <div className="mt-4 space-y-0">
                  {sections.map((sec) => (
                    <section key={sec.id} className="border-b border-slate-200 py-3.5 last:border-b-0">
                      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-900">{sec.title}</h3>
                      {sec.status?.trim() ? (
                        <p className="mt-1 text-[11px] font-bold" style={{ color: INV.blue }}>
                          {sec.status.trim()}
                        </p>
                      ) : null}
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                        {renderInlineMarkup(sec.body || "—")}
                      </p>
                    </section>
                  ))}
                </div>

                <div className="mt-5 overflow-hidden border border-slate-300">
                  <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white" style={{ background: INV.blue }}>
                    Document closure — attachment &amp; approval
                  </div>
                  <p className="whitespace-pre-line px-3 py-3 text-xs leading-relaxed text-slate-600">
                    {renderInlineMarkup(closureNote)}
                  </p>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div className="border-t border-slate-400 pt-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Prepared by</p>
                    <p className="mt-2 font-['Georgia',serif] text-base italic text-slate-700">{preparedByName}</p>
                    {signatureImage ? (
                      <img src={signatureImage} alt="" className="mt-2 block h-11 max-w-[150px] object-contain" />
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">{preparedByTitle}</p>
                    <p className="text-xs font-bold text-slate-800">{fromName}</p>
                  </div>
                  <div className="border-t border-slate-400 pt-3 text-left sm:text-right">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Company authorisation</p>
                    {stampImage ? (
                      <img
                        src={stampImage}
                        alt=""
                        className="mt-3 block h-24 w-auto max-w-[200px] object-contain opacity-95 sm:ml-auto"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="mt-8 border-t-2 pt-3" style={{ borderColor: INV.blue }}>
                  <div className="flex flex-wrap justify-between gap-2 text-[9px] text-slate-500">
                    <span>{footerPhone}</span>
                    <span>{footerEmail}</span>
                    <span>{footerAddress}</span>
                  </div>
                  <p className="mt-2 text-[9px] italic text-slate-500">{confidentiality}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
