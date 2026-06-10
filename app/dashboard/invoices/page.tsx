"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus, Printer, Trash2, Sparkles, FileDown, ImagePlus, RotateCcw, Phone, Mail, MapPin, ChevronDown, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useToast } from "@/hooks/use-toast"

type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

type PaymentMethod = {
  id: string
  /** Optional, e.g. "CRDB", "M-Pesa" — shown above bank lines when set */
  title: string
  accountName: string
  bank: string
  account: string
}

type InvoiceInitialValues = {
  fromName?: string
  companyTagline?: string
  companyWebsite?: string
}

type ExtraTableColumn = {
  key: string
  label: string
  align?: "left" | "center" | "right"
}

type ExtraTableSection = {
  title: string
  columns: ExtraTableColumn[]
  rows: Record<string, string>[]
  subtotal?: string
}

type PaymentScheduleRow = {
  phase: string
  description: string
  amount: string
  amountToPay: string
  deadline: string
}

type InvoiceExtraTables = {
  sections?: ExtraTableSection[]
  paymentSchedule?: PaymentScheduleRow[]
  paymentGrandTotal?: string
  paymentDeadline?: string
  note?: string
}

type DetailSectionKey =
  | "branding"
  | "company"
  | "invoiceMeta"
  | "contacts"
  | "items"
  | "totals"
  | "paymentMethods"
  | "terms"
  | "signer"
  | "signatureStamp"
  | "footer"

type DocumentKind = "invoice" | "quotation"

function documentKindLabels(kind: DocumentKind) {
  const isQuote = kind === "quotation"
  return {
    title: isQuote ? "QUOTATION" : "INVOICE",
    numberLabel: isQuote ? "Quotation no :" : "Invoice no :",
    billToLabel: isQuote ? "Quotation to:" : "Invoice to:",
    dueLabel: isQuote ? "Valid until:" : "Due:",
    metaSection: isQuote ? "Quotation meta" : "Invoice meta",
    numberField: isQuote ? "Quotation #" : "Invoice #",
  }
}

/** 4 fixed rows: material 50% + 50%, then service 50% + 50%; amounts are computed from section subtotals */
const PAYMENT_SCHEDULE_TEMPLATE: ReadonlyArray<Pick<PaymentScheduleRow, "phase" | "description" | "amount">> = [
  { phase: "1", description: "Material and Components (Electrical + Prototype)", amount: "50%" },
  { phase: "2", description: "Material and Components (Electrical + Prototype)", amount: "50%" },
  { phase: "3", description: "Service (first 50%)", amount: "50%" },
  { phase: "4", description: "Service (final 50%)", amount: "50%" },
]

const LOGO_STORAGE_KEY = "invoice-brand-logo"
const SIGNATURE_STORAGE_KEY = "invoice-digital-signature"
const STAMP_STORAGE_KEY = "invoice-company-stamp"

/** Matches the sample: professional blue headers & bars */
const INV = {
  blue: "#184a96",
  rowStripe: "#eff6ff",
  lineGray: "#e5e7eb",
} as const
const PROTOTYPE_RED_KEY = "__prototypeRowRed"

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isPrototypeSectionTitle(title: string): boolean {
  return /prototype/i.test(String(title || ""))
}

function isPrototypeRowHighlighted(row: Record<string, string>): boolean {
  const v = String(row?.[PROTOTYPE_RED_KEY] || "").toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

function convertInlineBoldToHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}

function columnWidthForKey(key: string): string {
  if (key === "sn") return "9%"
  if (key === "item") return "43%"
  if (key === "qty") return "12%"
  if (key === "unitPrice") return "18%"
  if (key === "totalPrice" || key === "amount") return "18%"
  return "18%"
}

function isSerialColumnKey(key: string): boolean {
  return key === "sn"
}

/** S/N is auto in the invoice; omit from the left-hand edit row inputs. */
function editableProjectColumns(section: ExtraTableSection): ExtraTableColumn[] {
  return section.columns.filter((col) => !isSerialColumnKey(col.key))
}

function projectEditRowGridClass(section: ExtraTableSection): string {
  const cols = editableProjectColumns(section)
  const n = cols.length
  if (n === 4 && cols[0]?.key === "item") {
    return "md:grid-cols-[minmax(0,2.5fr)_minmax(0,0.65fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
  }
  if (n === 3 && cols[0]?.key === "item") {
    return "md:grid-cols-[minmax(0,2.5fr)_minmax(0,0.75fr)_minmax(0,1fr)_auto]"
  }
  if (n <= 2) return "md:grid-cols-[minmax(0,1fr)_auto]"
  if (n === 3) return "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
  if (n === 4) return "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
  if (n === 5) return "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
  return "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
}

function displayProjectTableCell(
  row: Record<string, string>,
  col: ExtraTableColumn,
  rowIndex: number,
  currency: string
): string {
  if (isSerialColumnKey(col.key)) return String(rowIndex + 1)
  return displayProjectCellValue(row[col.key] ?? "", col.key, currency)
}

function parseMoneyInput(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "")
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatTzMoneyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "")
  if (!cleaned) return ""
  const [intPartRaw, decPartRaw] = cleaned.split(".")
  const intPart = intPartRaw ? Number(intPartRaw).toLocaleString("en-TZ") : "0"
  if (decPartRaw === undefined) return intPart
  return `${intPart}.${decPartRaw.slice(0, 2)}`
}

function parseQtyInput(value: string): number {
  const n = parseFloat(String(value).replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function lineTotalColumnKey(section: ExtraTableSection): string | null {
  if (section.columns.some((c) => c.key === "totalPrice")) return "totalPrice"
  if (
    section.columns.some((c) => c.key === "qty") &&
    section.columns.some((c) => c.key === "unitPrice") &&
    section.columns.some((c) => c.key === "amount")
  ) {
    return "amount"
  }
  return null
}

function canAutoLineTotal(section: ExtraTableSection): boolean {
  return (
    section.columns.some((c) => c.key === "qty") &&
    section.columns.some((c) => c.key === "unitPrice") &&
    Boolean(lineTotalColumnKey(section))
  )
}

function recomputeProjectRowLineTotal(section: ExtraTableSection, row: Record<string, string>): Record<string, string> {
  if (!canAutoLineTotal(section)) return row
  const totalK = lineTotalColumnKey(section)!
  const q = parseQtyInput(row.qty || "0")
  const u = parseMoneyInput(row.unitPrice || "0")
  const line = q * u
  if (q <= 0 && u <= 0) return { ...row, [totalK]: "" }
  if (line <= 0) return { ...row, [totalK]: "" }
  return { ...row, [totalK]: money(line) }
}

function isExampleProjectRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => /e\.g\./i.test(String(value || "")))
}

function formatLongDate(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso + "T12:00:00")
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

function parseFlexibleDateInput(value: string): Date | null {
  const s = String(value || "").trim()
  if (!s) return null
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const y = Number(isoMatch[1])
    const m = Number(isoMatch[2])
    const d = Number(isoMatch[3])
    const dt = new Date(y, m - 1, d)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (slashMatch) {
    // Enforce day-first schedule dates: DD/MM/YY (or DD/MM/YYYY legacy).
    const d = Number(slashMatch[1])
    const m = Number(slashMatch[2])
    const yRaw = Number(slashMatch[3])
    const y = String(slashMatch[3]).length === 2 ? 2000 + yRaw : yRaw
    const dt = new Date(y, m - 1, d)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sanitizeScheduleDateInput(value: string): string {
  return String(value || "").replace(/[^\d/]/g, "").slice(0, 10)
}

function normalizeScheduleDateOnBlur(value: string): string {
  const raw = sanitizeScheduleDateInput(value).trim()
  if (!raw) return ""
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return ""

  const day = String(Math.max(1, Math.min(31, Number(parts[0] || "0") || 0))).padStart(2, "0")
  const monthPart = parts[1] || ""
  if (!monthPart) return day
  const month = String(Math.max(1, Math.min(12, Number(monthPart) || 0))).padStart(2, "0")
  const yearPart = parts[2] || String(new Date().getFullYear())
  const year =
    yearPart.length <= 2
      ? String(2000 + (Number(yearPart) || 0))
      : String(Math.max(1900, Math.min(9999, Number(yearPart) || new Date().getFullYear())))

  return `${day}/${month}/${year}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isMoneyField(key: string): boolean {
  return /price|amount|total|subtotal|pay/i.test(key)
}

/** Strip leading currency tokens from pasted/saved cell text; body cells show numbers only. */
function stripLeadingCurrencyFromCell(raw: string, currency: string): string {
  let s = String(raw ?? "").trim()
  const cur = currency.trim()
  const variants = Array.from(new Set([cur, "TZS", "TSh", "USD"].filter(Boolean)))
  for (const v of variants) {
    const re = new RegExp(`^${escapeRegExp(v)}\\s*:?\\s*`, "i")
    s = s.replace(re, "").trim()
  }
  return s
}

function displayProjectCellValue(raw: string, colKey: string, currency: string): string {
  if (!isMoneyField(colKey)) return String(raw ?? "")
  return stripLeadingCurrencyFromCell(raw, currency)
}

/** Currency once in the header; skip if label already has a parenthesized currency code. */
function columnHeaderLabel(col: ExtraTableColumn, currency: string): string {
  const label = String(col.label || "").trim()
  if (!isMoneyField(col.key)) return label
  const cur = currency.trim()
  if (!cur) return label
  if (/\([A-Z]{2,4}\)/i.test(label)) return label
  return `${label} (${cur})`
}

export default function AdminInvoicesPage({
  initialValues,
  extraTables,
  dashboardScope = "main",
  savedListHref = "/dashboard/invoices/list",
}: {
  initialValues?: InvoiceInitialValues
  extraTables?: InvoiceExtraTables
  dashboardScope?: "main" | "project"
  savedListHref?: string
}) {
  const { themeClasses } = useTheme()
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const signatureInputRef = useRef<HTMLInputElement | null>(null)
  const stampInputRef = useRef<HTMLInputElement | null>(null)
  const termsTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`)
  const [documentKind, setDocumentKind] = useState<DocumentKind>("invoice")
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [fromName, setFromName] = useState(initialValues?.fromName ?? "Honic Company Store")
  const [companyTagline, setCompanyTagline] = useState(initialValues?.companyTagline ?? "ONLINE RETAIL")
  const [fromEmail, setFromEmail] = useState("support@honiccompany.com")
  const [fromPhone, setFromPhone] = useState("+255 786 957 939")
  const [companyWebsite, setCompanyWebsite] = useState(initialValues?.companyWebsite ?? "honiccompanystore.com")
  const [invoiceLogo, setInvoiceLogo] = useState<string>("")
  const [signatureImage, setSignatureImage] = useState<string>("")
  const [stampImage, setStampImage] = useState<string>("")
  const [billToName, setBillToName] = useState("")
  const [billToEmail, setBillToEmail] = useState("")
  const [billToPhone, setBillToPhone] = useState("")
  const [billToAddress, setBillToAddress] = useState("")
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { id: "pm-1", title: "LIPA NAMBA", accountName: "HONIC COMPANY LIMITED", bank: "SELCOM PESA", account: "6123 8368" },
  ])
  const [termsText, setTermsText] = useState(
    extraTables?.note ?? "Payment is due within 7 days. Please use the invoice number as your payment reference."
  )
  const [signerName, setSignerName] = useState("Authorized Signatory")
  const [signerTitle, setSignerTitle] = useState("Administrator")
  const [footerPhone, setFooterPhone] = useState("+255 786 957 939")
  const [footerEmail, setFooterEmail] = useState("support@honiccompany.com")
  const [footerAddress, setFooterAddress] = useState("Dar es Salaam, Tanzania")
  const [currency, setCurrency] = useState("TZS")
  const [taxRate, setTaxRate] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [thankYouLine, setThankYouLine] = useState("Thank you for your business.")
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: "1", description: "Product or service", quantity: 1, unitPrice: 0 },
  ])
  const [projectTables, setProjectTables] = useState<InvoiceExtraTables | undefined>(extraTables)
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [isLoadingSavedInvoice, setIsLoadingSavedInvoice] = useState(false)
  const [detailSectionVisible, setDetailSectionVisible] = useState<Record<DetailSectionKey, boolean>>({
    branding: true,
    company: true,
    invoiceMeta: true,
    contacts: true,
    items: true,
    totals: true,
    paymentMethods: true,
    terms: true,
    signer: true,
    signatureStamp: true,
    footer: true,
  })
  const savedInvoiceId = searchParams.get("invoiceId")
  const clientNameParam = searchParams.get("clientName")
  const studioMode = searchParams.get("mode")
  const isPreviewOnly = studioMode === "preview"
  const backToSavedInvoice = savedInvoiceId ? `/dashboard/invoices/list/${savedInvoiceId}?tab=preview` : "/dashboard/invoices/list"

  useEffect(() => {
    if (!savedInvoiceId) return
    let cancelled = false
    const loadSaved = async () => {
      setIsLoadingSavedInvoice(true)
      try {
        const res = await fetch(`/api/admin/invoices/${savedInvoiceId}`, { cache: "no-store", credentials: "include" })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load saved invoice")
        if (cancelled) return
        const inv = data.invoice as any
        const p = inv?.payload || {}

        setInvoiceNumber(String(inv?.invoice_number || p.invoiceNumber || ""))
        setDocumentKind(p.documentKind === "quotation" ? "quotation" : "invoice")
        setIssueDate(String(inv?.issue_date || p.issueDate || ""))
        setDueDate(String(inv?.due_date || p.dueDate || ""))
        setCurrency(String(inv?.currency || p.currency || "TZS"))
        setTaxRate(Number(p.taxRate || 0))
        setDiscount(Number(p.discount || 0))
        setBillToName(String(inv?.client_name || p.clientName || ""))
        setBillToEmail(String(p.clientEmail || ""))
        setBillToPhone(String(p.clientPhone || ""))
        setBillToAddress(String(p.clientAddress || ""))
        setFromName(String(p.fromName || fromName))
        setFromEmail(String(p.fromEmail || fromEmail))
        setFromPhone(String(p.fromPhone || fromPhone))
        setCompanyWebsite(String(p.companyWebsite || companyWebsite))
        setCompanyTagline(String(p.companyTagline || companyTagline))
        setSignerName(String(p.signerName || signerName))
        setSignerTitle(String(p.signerTitle || signerTitle))
        setFooterPhone(String(p.footerPhone || footerPhone))
        setFooterEmail(String(p.footerEmail || footerEmail))
        setFooterAddress(String(p.footerAddress || footerAddress))
        setThankYouLine(String(p.thankYouLine || thankYouLine))
        setTermsText(String(p.termsText || termsText))
        if (typeof p.invoiceLogo === "string" && p.invoiceLogo) setInvoiceLogo(p.invoiceLogo)
        if (typeof p.signatureImage === "string" && p.signatureImage) setSignatureImage(p.signatureImage)
        if (typeof p.stampImage === "string" && p.stampImage) setStampImage(p.stampImage)

        if (Array.isArray(p.items) && p.items.length) {
          setItems(
            p.items.map((it: any, idx: number) => ({
              id: `${Date.now()}-${idx}`,
              description: String(it.description || ""),
              quantity: Number(it.quantity || 0),
              unitPrice: Number(it.unitPrice || 0),
            }))
          )
        }

        if (Array.isArray(p.paymentMethods) && p.paymentMethods.length) {
          setPaymentMethods(
            p.paymentMethods.map((pm: any, idx: number) => ({
              id: String(pm.id || `pm-${Date.now()}-${idx}`),
              title: String(pm.title || ""),
              accountName: String(pm.accountName || ""),
              bank: String(pm.bank || ""),
              account: String(pm.account || ""),
            }))
          )
        }

        if (p.projectTables) setProjectTables(p.projectTables as InvoiceExtraTables)
      } catch (e) {
        toast({
          title: "Load failed",
          description: e instanceof Error ? e.message : "Could not load saved invoice.",
          variant: "destructive",
        })
      } finally {
        if (!cancelled) setIsLoadingSavedInvoice(false)
      }
    }
    loadSaved()
    return () => {
      cancelled = true
    }
  }, [savedInvoiceId])

  useEffect(() => {
    if (savedInvoiceId) return
    if (!clientNameParam) return
    setBillToName(clientNameParam)
  }, [clientNameParam, savedInvoiceId])

  useEffect(() => {
    try {
      const savedLogo = localStorage.getItem(LOGO_STORAGE_KEY)
      if (savedLogo) setInvoiceLogo(savedLogo)
      const savedSig = localStorage.getItem(SIGNATURE_STORAGE_KEY)
      if (savedSig) setSignatureImage(savedSig)
      const savedStamp = localStorage.getItem(STAMP_STORAGE_KEY)
      if (savedStamp) setStampImage(savedStamp)
    } catch {
      // ignore storage access failures
    }
  }, [])

  useEffect(() => {
    if (!invoiceLogo) return
    localStorage.setItem(LOGO_STORAGE_KEY, invoiceLogo)
  }, [invoiceLogo])

  useEffect(() => {
    if (!signatureImage) return
    localStorage.setItem(SIGNATURE_STORAGE_KEY, signatureImage)
  }, [signatureImage])

  useEffect(() => {
    if (!stampImage) return
    localStorage.setItem(STAMP_STORAGE_KEY, stampImage)
  }, [stampImage])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  )
  const taxAmount = useMemo(() => (subtotal * taxRate) / 100, [subtotal, taxRate])
  const total = useMemo(() => Math.max(0, subtotal + taxAmount - discount), [subtotal, taxAmount, discount])

  const websiteDisplay = companyWebsite.replace(/^https?:\/\//i, "").toLowerCase()
  const docLabels = useMemo(() => documentKindLabels(documentKind), [documentKind])
  const hasProjectTables = Boolean(projectTables?.sections?.length || projectTables?.paymentSchedule?.length)
  const getSectionSubtotal = (section: ExtraTableSection): number => {
    const totalKey =
      section.columns.find((col) => /total/i.test(col.key))?.key ??
      section.columns.find((col) => /amount/i.test(col.key))?.key ??
      section.columns[section.columns.length - 1]?.key
    if (!totalKey) return 0
    return section.rows.reduce((sum, row) => sum + parseMoneyInput(row[totalKey] || "0"), 0)
  }
  const projectSubtotal = useMemo(
    () => (projectTables?.sections || []).reduce((sum, section) => sum + getSectionSubtotal(section), 0),
    [projectTables]
  )
  /** Section 0+1 = Electrical + Prototype; section 2 = Service */
  const materialSubtotalForSchedule = useMemo(() => {
    const secs = projectTables?.sections
    if (!secs?.length) return 0
    const a = getSectionSubtotal(secs[0]!)
    const b = secs[1] ? getSectionSubtotal(secs[1]) : 0
    return a + b
  }, [projectTables])
  const serviceSubtotalForSchedule = useMemo(() => {
    const secs = projectTables?.sections
    if (!secs || secs.length < 3) return 0
    return getSectionSubtotal(secs[2]!)
  }, [projectTables])
  const effectiveSubtotal = hasProjectTables ? projectSubtotal : subtotal
  const effectiveTaxAmount = (effectiveSubtotal * taxRate) / 100
  const effectiveGrandTotal = Math.max(0, effectiveSubtotal + effectiveTaxAmount - discount)
  /** Phases 1–2: half each of (grand total − Service section); phases 3–4: half each of Service section — matches Payments screen */
  const paymentScheduleDisplay = useMemo(() => {
    const raw = projectTables?.paymentSchedule || []
    const gt = Math.max(0, Math.round(effectiveGrandTotal))
    const svcRaw = Math.max(0, Math.round(serviceSubtotalForSchedule))
    const svcApplied = Math.min(svcRaw, gt)
    const materialRemainder = Math.max(0, gt - svcApplied)
    const p1 = Math.floor(materialRemainder / 2)
    const p2 = materialRemainder - p1
    const p3 = Math.floor(svcApplied / 2)
    const p4 = svcApplied - p3
    const payAmounts = [p1, p2, p3, p4]
    return PAYMENT_SCHEDULE_TEMPLATE.map((meta, i) => ({
      phase: meta.phase,
      description: meta.description,
      amount: meta.amount,
      amountToPay: payAmounts[i] ?? 0,
      deadline: raw[i]?.deadline ?? "",
    }))
  }, [projectTables?.paymentSchedule, effectiveGrandTotal, serviceSubtotalForSchedule])
  const computedPaymentDuration = useMemo(() => {
    const deadlines = paymentScheduleDisplay.map((r) => parseFlexibleDateInput(r.deadline)).filter(Boolean) as Date[]
    if (!deadlines.length) return projectTables?.paymentDeadline || ""
    const start = deadlines[0]!
    const end = deadlines[deadlines.length - 1]!
    const diffMs = end.getTime() - start.getTime()
    if (!Number.isFinite(diffMs) || diffMs < 0) return projectTables?.paymentDeadline || ""
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
    return `${days} Days`
  }, [paymentScheduleDisplay, projectTables?.paymentDeadline])

  useEffect(() => {
    if (!hasProjectTables || !projectTables?.paymentSchedule) return
    if (projectTables.paymentSchedule.length === 4) return
    setProjectTables((prev) => {
      if (!prev) return prev
      const current = prev.paymentSchedule || []
      const next = (
        current.length > 4
          ? current.slice(0, 4)
          : [
              ...current,
              ...Array.from({ length: 4 - current.length }, () => ({
                phase: "",
                description: "",
                amount: "",
                amountToPay: "",
                deadline: "",
              })),
            ]
      ) as PaymentScheduleRow[]
      return { ...prev, paymentSchedule: next }
    })
  }, [hasProjectTables, projectTables?.paymentSchedule?.length])

  const updateItem = (id: string, patch: Partial<InvoiceItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, description: "", quantity: 1, unitPrice: 0 },
    ])
  }

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev))
  }

  const updatePaymentMethod = (id: string, patch: Partial<PaymentMethod>) => {
    setPaymentMethods((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const addPaymentMethod = () => {
    setPaymentMethods((prev) => [
      ...prev,
      {
        id: `pm-${Date.now()}-${prev.length}`,
        title: "LIPA NAMBA",
        accountName: "HONIC COMPANY LIMITED",
        bank: "SELCOM PESA",
        account: "6123 8368",
      },
    ])
  }

  const removePaymentMethod = (id: string) => {
    setPaymentMethods((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev))
  }

  const handleTermsKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "b") return
    e.preventDefault()
    const el = termsTextareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = termsText.slice(start, end)
    const wrapped = `**${selected || "bold text"}**`
    const next = `${termsText.slice(0, start)}${wrapped}${termsText.slice(end)}`
    setTermsText(next)
    requestAnimationFrame(() => {
      const caretStart = start + 2
      const caretEnd = start + wrapped.length - 2
      el.focus()
      el.setSelectionRange(caretStart, caretEnd)
    })
  }

  const updateProjectSectionCell = (sectionIndex: number, rowIndex: number, key: string, value: string) => {
    setProjectTables((prev) => {
      if (!prev?.sections) return prev
      const sections = prev.sections.map((section, sIdx) => {
        if (sIdx !== sectionIndex) return section
        const totalK = lineTotalColumnKey(section)
        const rows = section.rows.map((row, rIdx) => {
          if (rIdx !== rowIndex) return row
          if (canAutoLineTotal(section) && totalK && key === totalK) return row
          const nextValue = isMoneyField(key) ? formatTzMoneyInput(value) : value
          const next = { ...row, [key]: nextValue }
          return recomputeProjectRowLineTotal(section, next)
        })
        return { ...section, rows }
      })
      return { ...prev, sections }
    })
  }

  const updatePaymentScheduleCell = (rowIndex: number, key: keyof PaymentScheduleRow, value: string) => {
    if (key !== "deadline") return
    const normalized = sanitizeScheduleDateInput(value)
    setProjectTables((prev) => {
      if (!prev?.paymentSchedule) return prev
      const paymentSchedule = prev.paymentSchedule.map((row, idx) => (idx === rowIndex ? { ...row, [key]: normalized } : row))
      return { ...prev, paymentSchedule }
    })
  }

  const normalizePaymentScheduleDeadlineOnBlur = (rowIndex: number) => {
    setProjectTables((prev) => {
      if (!prev?.paymentSchedule) return prev
      const paymentSchedule = prev.paymentSchedule.map((row, idx) =>
        idx === rowIndex ? { ...row, deadline: normalizeScheduleDateOnBlur(String(row.deadline || "")) } : row
      )
      return { ...prev, paymentSchedule }
    })
  }

  const addProjectSectionRow = (sectionIndex: number) => {
    setProjectTables((prev) => {
      if (!prev?.sections) return prev
      const sections = prev.sections.map((section, sIdx) => {
        if (sIdx !== sectionIndex) return section
        const existingRows = section.rows.filter((row) => !isExampleProjectRow(row))
        const nextRow: Record<string, string> = {}
        section.columns.forEach((col) => {
          nextRow[col.key] = ""
        })
        if ("sn" in nextRow) nextRow.sn = String(existingRows.length + 1)
        const withLineTotal = recomputeProjectRowLineTotal(section, nextRow)
        return { ...section, rows: [...existingRows, withLineTotal] }
      })
      return { ...prev, sections }
    })
  }

  const removeProjectSectionRow = (sectionIndex: number, rowIndex: number) => {
    setProjectTables((prev) => {
      if (!prev?.sections) return prev
      const sections = prev.sections.map((section, sIdx) => {
        if (sIdx !== sectionIndex) return section
        if (section.rows.length <= 1) return section
        const rows = section.rows.filter((_, idx) => idx !== rowIndex).map((row, idx) => {
          const hasSn = section.columns.some((c) => isSerialColumnKey(c.key))
          return hasSn ? { ...row, sn: String(idx + 1) } : row
        })
        return { ...section, rows }
      })
      return { ...prev, sections }
    })
  }

  const togglePrototypeSectionRowHighlight = (sectionIndex: number, rowIndex: number, checked: boolean) => {
    setProjectTables((prev) => {
      if (!prev?.sections) return prev
      const sections = prev.sections.map((section, sIdx) => {
        if (sIdx !== sectionIndex) return section
        if (!isPrototypeSectionTitle(section.title)) return section
        const rows = section.rows.map((row, rIdx) =>
          rIdx === rowIndex ? { ...row, [PROTOTYPE_RED_KEY]: checked ? "1" : "" } : row
        )
        return { ...section, rows }
      })
      return { ...prev, sections }
    })
  }

  const uploadInvoiceAsset = async (file: File, kind: "logo" | "signature" | "stamp"): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.readAsDataURL(file)
    })
    if (!dataUrl) throw new Error("Empty image data")
    const res = await fetch("/api/admin/invoices/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        kind,
        filename: file.name,
        dataUrl,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.success || !data?.url) {
      throw new Error(data?.error || data?.details || "Asset upload failed")
    }
    return String(data.url)
  }

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadInvoiceAsset(file, "logo")
      setInvoiceLogo(url)
      localStorage.setItem(LOGO_STORAGE_KEY, url)
    } catch (e) {
      toast({
        title: "Logo upload failed",
        description: e instanceof Error ? e.message : "Could not upload logo to bucket.",
        variant: "destructive",
      })
    }
    event.target.value = ""
  }

  const clearLogo = () => {
    setInvoiceLogo("")
    localStorage.removeItem(LOGO_STORAGE_KEY)
  }

  const handleSignatureUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadInvoiceAsset(file, "signature")
      setSignatureImage(url)
      localStorage.setItem(SIGNATURE_STORAGE_KEY, url)
    } catch (e) {
      toast({
        title: "Signature upload failed",
        description: e instanceof Error ? e.message : "Could not upload signature to bucket.",
        variant: "destructive",
      })
    }
    event.target.value = ""
  }

  const clearSignature = () => {
    setSignatureImage("")
    localStorage.removeItem(SIGNATURE_STORAGE_KEY)
  }

  const handleStampUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadInvoiceAsset(file, "stamp")
      setStampImage(url)
      localStorage.setItem(STAMP_STORAGE_KEY, url)
    } catch (e) {
      toast({
        title: "Stamp upload failed",
        description: e instanceof Error ? e.message : "Could not upload stamp to bucket.",
        variant: "destructive",
      })
    }
    event.target.value = ""
  }

  const clearStamp = () => {
    setStampImage("")
    localStorage.removeItem(STAMP_STORAGE_KEY)
  }

  const toggleDetailSection = (key: DetailSectionKey) => {
    setDetailSectionVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const downloadAsPdf = async () => {
    if (!isPreviewOnly) {
      const saved = await saveInvoiceToDatabase({ silent: true })
      if (!saved) return
    }
    const blue = INV.blue
    const rowStripe = INV.rowStripe
    const rows = items
      .map((item, index) => {
        const rowTotal = item.quantity * item.unitPrice
        const rowBg =
          index % 2 === 1
            ? `background-color:${rowStripe} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;`
            : `background-color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;`
        return `
          <tr style="${rowBg}">
            <td style="font-size:12px;text-align:center;color:#111;">${index + 1}</td>
            <td style="font-size:12px;color:#111;">${escapeHtml(item.description || "—")}</td>
            <td style="font-size:12px;text-align:right;color:#111;">${item.quantity}</td>
            <td style="font-size:12px;text-align:right;color:#111;">${money(item.unitPrice)}</td>
            <td style="font-size:12px;text-align:right;font-weight:600;color:#111;">${money(rowTotal)}</td>
          </tr>
        `
      })
      .join("")

    const logoHtml = invoiceLogo
      ? `<img src="${invoiceLogo}" alt="" style="height:72px;max-width:128px;object-fit:contain;" />`
      : `<div style="height:72px;width:72px;border-radius:50%;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:9px;color:#9ca3af;">Logo</div>`

    const billLines = [billToAddress, billToEmail, billToPhone].filter(Boolean)
    const billContact = billLines.map((l) => `<p style="margin:2px 0;font-size:12px;color:#6b7280;">${escapeHtml(l)}</p>`).join("")

    const discountRow =
      discount > 0
        ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#374151;">
            <span>Discount :</span><span>${currency} ${money(discount)}</span></div>`
        : ""

    const paymentMethodsHtml = paymentMethods
      .map((pm) => {
        const title = pm.title.trim()
          ? `<p class="pay-m-title">${escapeHtml(pm.title.trim())}</p>`
          : ""
        return `
            <div class="pay-method">
              ${title}
              <p class="pay-line"><span class="pay-lbl">Account name</span><strong>${escapeHtml(pm.accountName || "—")}</strong></p>
              <p class="pay-line"><span class="pay-lbl">Bank</span><strong>${escapeHtml(pm.bank || "—")}</strong></p>
              <p class="pay-line pay-line-last"><span class="pay-lbl">Account</span><strong>${escapeHtml(pm.account || "—")}</strong></p>
            </div>`
      })
      .join("")

    const extraSectionsHtml = (projectTables?.sections || [])
      .map((section) => {
        const isPrototype = isPrototypeSectionTitle(section.title)
        const cols = section.columns
          .map(
            (col) =>
              `<th class="${
                col.align === "right" ? "r" : col.align === "center" ? "c" : ""
              }" style="width:${columnWidthForKey(col.key)};">${escapeHtml(columnHeaderLabel(col, currency))}</th>`
          )
          .join("")
        const colgroup = `<colgroup>${section.columns
          .map((col) => `<col style="width:${columnWidthForKey(col.key)};" />`)
          .join("")}</colgroup>`
        const rowsHtml = section.rows
          .map((row, rowIndex) => {
            const cells = section.columns
              .map((col) => {
                const value = displayProjectTableCell(row, col, rowIndex, currency)
                const klass = col.align === "right" ? "r" : col.align === "center" ? "c" : ""
                const rowRed = isPrototype && isPrototypeRowHighlighted(row)
                return `<td class="${klass}" style="${rowRed ? "color:#b91c1c;" : ""}">${escapeHtml(value)}</td>`
              })
              .join("")
            return `<tr style="${rowIndex % 2 === 1 ? `background-color:${rowStripe} !important;` : ""}">${cells}</tr>`
          })
          .join("")
        const computedSubtotal = getSectionSubtotal(section)
        const subtotalRow = `<tr><td colspan="${Math.max(1, section.columns.length - 1)}" style="text-align:right;font-weight:800;">SUBTOTAL</td><td class="r" style="font-weight:800;">${money(computedSubtotal)}</td></tr>`
        return `
          <div class="extra-block">
            <p class="extra-title">${escapeHtml(section.title)}</p>
            <table class="extra-table">
              ${colgroup}
              <thead><tr>${cols}</tr></thead>
              <tbody>${rowsHtml}${subtotalRow}</tbody>
            </table>
          </div>
        `
      })
      .join("")

    const secListPdf = projectTables?.sections || []
    const svcTotalPdf = secListPdf[2] ? getSectionSubtotal(secListPdf[2]) : 0
    const gtPdf = Math.max(0, Math.round(effectiveGrandTotal))
    const svcPdf = Math.max(0, Math.round(svcTotalPdf))
    const svcAppliedPdf = Math.min(svcPdf, gtPdf)
    const matRemPdf = Math.max(0, gtPdf - svcAppliedPdf)
    const payAmtPdf = [
      Math.floor(matRemPdf / 2),
      matRemPdf - Math.floor(matRemPdf / 2),
      Math.floor(svcAppliedPdf / 2),
      svcAppliedPdf - Math.floor(svcAppliedPdf / 2),
    ]
    const schedRawPdf = projectTables?.paymentSchedule || []
    const paymentScheduleHtml = hasProjectTables
      ? `
        <div class="extra-block">
          <p class="extra-title">PAYMENT SCHEDULE</p>
          <table class="extra-table schedule-table">
            <colgroup>
              <col style="width:9%;" />
              <col style="width:45%;" />
              <col style="width:14%;" />
              <col style="width:17%;" />
              <col style="width:15%;" />
            </colgroup>
            <thead>
              <tr>
                <th class="c">Phase</th>
                <th>Description</th>
                <th class="r">Amount</th>
                <th class="r">Amount to pay (${escapeHtml(currency)})</th>
                <th class="c">Deadline</th>
              </tr>
            </thead>
            <tbody>
              ${PAYMENT_SCHEDULE_TEMPLATE.map(
                (meta, idx) => `
                <tr style="${idx % 2 === 1 ? `background-color:${rowStripe} !important;` : ""}">
                  <td class="c">${escapeHtml(meta.phase)}</td>
                  <td>${escapeHtml(meta.description)}</td>
                  <td class="r">${escapeHtml(meta.amount)}</td>
                  <td class="r">${money(payAmtPdf[idx] ?? 0)}</td>
                  <td class="c">${escapeHtml(schedRawPdf[idx]?.deadline || "")}</td>
                </tr>
              `
              ).join("")}
              <tr>
                <td class="c" style="font-weight:800;">FINAL</td>
                <td></td>
                <td class="r" style="font-weight:800;">100%</td>
                <td class="r" style="font-weight:800;">${money(effectiveGrandTotal)}</td>
                <td class="c" style="font-weight:800;">${escapeHtml(computedPaymentDuration)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `
      : ""

    const paymentMethodHtml = `
      <div class="pay" style="margin-top:22px;">
        <div class="pay-wrap">
          <div class="pay-head">Payment method</div>
          <div class="pay-box">
            ${paymentMethodsHtml}
          </div>
        </div>
      </div>
    `

    /** Bold line under italic label shows signature image only (no duplicate text). */
    const signBoldSignatureHtml = signatureImage
      ? `<p class="sign-b"><img src="${signatureImage}" alt="" /></p>`
      : ""
    const stampBelowSignatureHtml = stampImage
      ? `<p class="sign-stamp"><img src="${stampImage}" alt="" /></p>`
      : ""

    const buildInvoiceHtml = () => `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(invoiceNumber)}.pdf</title>
          <style>
            /* Required so Chrome/Edge/Safari print blue bars, table header, stripes (not "blank" PDF) */
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif; margin: 0; padding: 12px; color: #111827; background: #f1f5f9; }
            /* Framed invoice — border must use solid + print rules so PDF/print always shows a box */
            .page {
              position: relative;
              overflow: hidden;
              max-width: 820px;
              margin: 0 auto;
              padding: 28px 32px;
              background: #fff;
              box-sizing: border-box;
              border: 1px solid rgba(15, 23, 42, 0.22);
              border-radius: 8px;
              box-shadow:
                0 1px 2px rgba(15, 23, 42, 0.05),
                0 3px 10px rgba(15, 23, 42, 0.07);
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-inner { position: relative; z-index: 1; }
            .sign-stamp { margin: 8px 0 0; padding: 0; text-align: right; }
            .sign-stamp img { max-height: 140px; max-width: 280px; object-fit: contain; vertical-align: bottom; opacity: 0.95; }
            .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .co { font-size: 18px; font-weight: 800; color: #111; letter-spacing: -0.02em; }
            .tag { font-size: 10px; font-weight: 800; color: #374151; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px; }
            .inv-title { font-size: 36px; font-weight: 800; color: ${blue}; letter-spacing: 0.04em; line-height: 1; }
            .line-wrap { position: relative; margin-top: 14px; min-height: 1px; }
            /* border-top prints reliably; thin background divs often disappear in “Save as PDF” */
            .line-bg { width: 100%; height: 0; margin: 0; padding: 0; border: 0; border-top: 1px solid #d1d5db; }
            .line-accent { position: absolute; left: 0; top: 0; width: 96px; height: 0; border: 0; border-top: 3px solid ${blue}; }
            .meta { display: flex; justify-content: space-between; margin-top: 24px; gap: 24px; }
            .to-label { font-size: 12px; font-weight: 700; color: #111; margin-bottom: 6px; }
            .to-name { font-size: 15px; font-weight: 800; color: #111; margin: 0 0 4px; }
            .inv-meta { text-align: right; }
            .inv-no { font-size: 14px; font-weight: 800; color: #111; }
            .inv-date { font-size: 13px; color: #111; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #cbd5e1; }
            th { background-color: ${blue} !important; background: ${blue} !important; color: #fff !important; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 10px 14px; text-align: left; font-weight: 700; border: 1px solid ${blue}; }
            td { border: 1px solid #e5e7eb; padding: 10px 14px; }
            th.c { text-align: center; }
            th.r { text-align: right; }
            .totals { display: block; margin-top: 0; border-top: 1px solid #e5e7eb; padding-top: 20px; }
            .sum { max-width: 240px; margin-left: auto; text-align: right; }
            .pay { margin-top: 18px; max-width: 360px; text-align: left; }
            .pay-wrap { border: none; background: transparent; }
            .pay-head { background: transparent; color: #111827; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding: 0 0 8px; margin: 0 0 8px; border: none; border-bottom: 1px solid #e5e7eb; }
            .pay-box { background: transparent; padding: 4px 0 0 12px; border: none; border-left: 4px solid ${blue} !important; -webkit-print-color-adjust: exact; }
            .pay-method + .pay-method { margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
            .pay-m-title { font-size: 10px; font-weight: 800; color: #1e293b; margin: 0 0 6px; letter-spacing: 0.06em; text-transform: uppercase; }
            .pay-line { font-size: 12px; color: #1e293b; margin: 0 0 6px; line-height: 1.45; }
            .pay-line-last { margin-bottom: 0 !important; }
            .pay-lbl { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
            .sumline { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 0; color: #374151; }
            .grand { background-color: ${blue} !important; background: ${blue} !important; color: #fff !important; border: 1px solid ${blue}; display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; }
            .extra-block { margin-top: 8px; }
            .extra-title { margin: 0 0 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: #0f172a; text-transform: uppercase; }
            .extra-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin-top: 4px; table-layout: fixed; }
            .schedule-table { table-layout: auto; }
            .extra-table th { background-color: ${blue} !important; color: #fff !important; font-size: 10px; padding: 7px 10px; border: 1px solid ${blue}; }
            .extra-table td { font-size: 11px; border: 1px solid #e5e7eb; padding: 6px 10px; color: #0f172a; }
            .extra-table td.c, .extra-table th.c { text-align: center; }
            .extra-table td.r, .extra-table th.r { text-align: right; }
            .extra-note { margin: 8px 0 0; font-size: 10px; color: #334155; line-height: 1.45; }
            .foot { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; align-items: flex-end; }
            .terms { flex: 1; min-width: 200px; font-size: 12px; line-height: 1.5; color: #4b5563; }
            .terms h4 { font-size: 12px; font-weight: 800; color: #111; margin: 10px 0 4px; }
            .sign { text-align: right; min-width: 150px; max-width: 170px; }
            .sign-name { font-size: 18px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; color: #1f2937; }
            .sign-b { margin: 8px 0 0; padding: 0; text-align: right; }
            .sign-b img { max-height: 64px; max-width: 170px; object-fit: contain; vertical-align: bottom; display: inline-block; }
            .sign-t { font-size: 11px; color: #6b7280; }
            .bar { position: relative; margin-top: 24px; min-height: 1px; }
            .bar .line-bg { width: 100%; height: 0; border: 0; border-top: 1px solid #d1d5db; }
            .bar .line-accent { left: auto; right: 0; top: 0; width: 96px; height: 0; border: 0; border-top: 3px solid ${blue}; }
            .icons { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-top: 12px; font-size: 11px; color: #4b5563; }
            .ic { display: flex; align-items: center; gap: 8px; }
            .ic svg { display: none; }
            @page { size: A4; margin: 10mm; }
            @media print {
              html, body, * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              /* Room around the frame so the border isn’t clipped at the paper edge */
              body {
                background: #fff !important;
                padding: 4mm !important;
                margin: 0 !important;
              }
              .page {
                position: relative !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
                border: 0.75pt solid rgba(15, 23, 42, 0.2) !important;
                border-color: rgba(15, 23, 42, 0.2) !important;
                border-radius: 6px !important;
                box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1) !important;
                margin: 0 auto !important;
                max-width: 100% !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .page-inner, .sign-sig img, .sign-stamp img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="page-inner">
            <div class="head">
              <div class="brand">
                ${logoHtml}
                <div>
                  <div class="co">${escapeHtml(fromName || "Your company")}</div>
                  <div class="tag">${escapeHtml(companyTagline || " ")}</div>
                </div>
              </div>
              <div class="inv-title">${escapeHtml(docLabels.title)}</div>
            </div>
            <div class="line-wrap">
              <div class="line-bg"></div>
              <div class="line-accent"></div>
            </div>
            <div class="meta">
              <div>
                <p class="to-label">${escapeHtml(docLabels.billToLabel)}</p>
                <p class="to-name">${escapeHtml(billToName || "Client name")}</p>
                ${billContact}
              </div>
              <div class="inv-meta">
                <p class="inv-no">${escapeHtml(docLabels.numberLabel)} ${escapeHtml(invoiceNumber)}</p>
                <p class="inv-date">${escapeHtml(formatLongDate(issueDate))}</p>
                <p class="inv-date" style="color:#6b7280;margin-top:4px;">${escapeHtml(docLabels.dueLabel)} ${escapeHtml(formatLongDate(dueDate))}</p>
              </div>
            </div>
            ${
              hasProjectTables
                ? ""
                : `<table style="table-layout:fixed;">
              <colgroup>
                <col style="width:${columnWidthForKey("sn")};" />
                <col style="width:${columnWidthForKey("item")};" />
                <col style="width:${columnWidthForKey("qty")};" />
                <col style="width:${columnWidthForKey("unitPrice")};" />
                <col style="width:${columnWidthForKey("totalPrice")};" />
              </colgroup>
              <thead>
                <tr>
                  <th class="c">NO</th>
                  <th>DESCRIPTION</th>
                  <th class="r">QTY</th>
                  <th class="r">PRICE (${escapeHtml(currency)})</th>
                  <th class="r">TOTAL (${escapeHtml(currency)})</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
            }
            ${extraSectionsHtml}
            <div class="totals">
              <div class="sum">
                <div class="sumline"><span>Sub Total :</span><span>${currency} ${money(effectiveSubtotal)}</span></div>
                <div class="sumline"><span>Tax ${taxRate}% :</span><span>${currency} ${money(effectiveTaxAmount)}</span></div>
                ${discountRow}
                <div class="grand"><span>GRAND TOTAL :</span><span>${currency} ${money(effectiveGrandTotal)}</span></div>
              </div>
            </div>
            ${paymentScheduleHtml}
            ${paymentMethodHtml}
            <div class="foot">
              <div class="terms">
                <p style="margin:0 0 8px;font-weight:800;color:#111;">${escapeHtml(thankYouLine || "Thank you.")}</p>
                <h4>Term and Conditions:</h4>
                <p style="margin:0;white-space:pre-line;">${convertInlineBoldToHtml(termsText || "—")}</p>
              </div>
              <div class="sign">
                <p class="sign-name">${escapeHtml(signerName)}</p>
                ${signBoldSignatureHtml}
                <p class="sign-t">${escapeHtml(signerTitle)}</p>
                ${stampBelowSignatureHtml}
              </div>
            </div>
            <div class="bar">
              <div class="line-bg"></div>
              <div class="line-accent"></div>
            </div>
            <div class="icons">
              <div class="ic">📞 <span>${escapeHtml(footerPhone)}</span></div>
              <div class="ic">✉ <span>${escapeHtml(footerEmail)}</span></div>
              <div class="ic">📍 <span>${escapeHtml(footerAddress)}</span></div>
            </div>
            </div>
          </div>
        </body>
      </html>
    `

    // Defer so the click handler can finish; avoids the UI freezing in some browsers
    const invoiceHtml = buildInvoiceHtml()
    window.setTimeout(() => {
      const iframe = document.createElement("iframe")
      iframe.setAttribute("title", "Invoice print")
      iframe.setAttribute("aria-hidden", "true")
      iframe.setAttribute("tabindex", "-1")
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;visibility:hidden"

      let done = false
      const removeFrame = () => {
        if (done) return
        done = true
        try {
          iframe.remove()
        } catch {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe)
          }
        }
      }

      document.body.appendChild(iframe)
      const idoc = iframe.contentDocument
      if (!idoc) {
        removeFrame()
        toast({
          title: "Print unavailable",
          description: "Your browser would not open the print view. Try again or use the Print button instead.",
          variant: "destructive",
        })
        return
      }

      try {
        idoc.open()
        idoc.write(invoiceHtml)
        idoc.close()
      } catch {
        removeFrame()
        toast({
          title: "Print failed",
          description: "Could not build the print document. If your logo is very large, try a smaller image.",
          variant: "destructive",
        })
        return
      }

      // Let layout, fonts, and data-URIs (logo) complete before print — avoids a frozen tab
      window.setTimeout(() => {
        const w = iframe.contentWindow
        if (!w) {
          removeFrame()
          return
        }
        const after = () => removeFrame()
        w.addEventListener("afterprint", after, { once: true })
        // Safety: some browsers never fire afterprint
        window.setTimeout(() => {
          if (!done) removeFrame()
        }, 120_000)
        try {
          w.focus()
          w.print()
        } catch {
          removeFrame()
          toast({
            title: "Print failed",
            description: "The browser could not start printing.",
            variant: "destructive",
          })
        }
      }, 300)
    }, 0)
  }

  const saveInvoiceToDatabase = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent)
    if (!billToName.trim()) {
      if (!silent) {
        toast({
          title: "Client name required",
          description: "Please fill Invoice to (client name) before saving.",
          variant: "destructive",
        })
      }
      return
    }

    const hasMissingPaymentRequired = paymentMethods.some(
      (pm) => !String(pm.accountName || "").trim() || !String(pm.bank || "").trim() || !String(pm.account || "").trim()
    )
    if (hasMissingPaymentRequired) {
      if (!silent) {
        toast({
          title: "Payment method incomplete",
          description: "Please fill Account name, Bank, and Account number for each payment method.",
          variant: "destructive",
        })
      }
      return
    }

    const payload = {
      invoiceNumber,
      documentKind,
      invoiceId: savedInvoiceId || undefined,
      dashboardScope,
      issueDate,
      dueDate,
      currency,
      taxRate,
      discount,
      clientName: billToName.trim(),
      clientEmail: billToEmail,
      clientPhone: billToPhone,
      clientAddress: billToAddress,
      fromName,
      fromEmail,
      fromPhone,
      companyWebsite,
      companyTagline,
      signerName,
      signerTitle,
      footerPhone,
      footerEmail,
      footerAddress,
      thankYouLine,
      termsText,
      items,
      paymentMethods,
      projectTables,
      invoiceLogo,
      signatureImage,
      stampImage,
      totals: {
        subtotal: effectiveSubtotal,
        taxAmount: effectiveTaxAmount,
        grandTotal: effectiveGrandTotal,
      },
    }

    setIsSavingInvoice(true)
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.details || "Failed to save invoice")
      }
      if (data?.invoice?.invoice_number) {
        setInvoiceNumber(String(data.invoice.invoice_number))
      }
      const nextInvoiceId = String(data?.invoice?.id || "")
      if (!savedInvoiceId && nextInvoiceId) {
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.set("invoiceId", nextInvoiceId)
        if (!nextParams.get("mode")) nextParams.set("mode", "edit")
        router.replace(`${pathname}?${nextParams.toString()}`)
      }
      if (!silent) {
        toast({
          title: "Invoice saved",
          description: `${String(data?.invoice?.invoice_number || invoiceNumber)} saved for ${billToName.trim()}.`,
        })
      }
      return data?.invoice
    } catch (error) {
      if (!silent) {
        toast({
          title: "Save failed",
          description: error instanceof Error ? error.message : "Could not save invoice.",
          variant: "destructive",
        })
      }
      return null
    } finally {
      setIsSavingInvoice(false)
    }
  }

  return (
    <div className={cn("space-y-6", themeClasses.mainText)}>
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoice Studio</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>
            Blue header style, zebra rows, payment block — matches classic agency invoices.
          </p>
          {savedInvoiceId ? (
            <p className={cn("mt-1 text-xs", themeClasses.textNeutralSecondary)}>
              {isLoadingSavedInvoice ? "Loading saved invoice..." : `Loaded saved invoice (${studioMode || "edit"} mode).`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {!isPreviewOnly ? (
            <div className="inline-flex self-start rounded-lg border border-border p-0.5 sm:self-end">
              <Button
                type="button"
                size="sm"
                variant={documentKind === "invoice" ? "default" : "ghost"}
                className={cn(
                  "h-8 rounded-md px-4 text-xs font-semibold",
                  documentKind === "invoice" && "bg-[#184a96] text-white hover:bg-[#184a96]/90"
                )}
                onClick={() => setDocumentKind("invoice")}
              >
                Invoice
              </Button>
              <Button
                type="button"
                size="sm"
                variant={documentKind === "quotation" ? "default" : "ghost"}
                className={cn(
                  "h-8 rounded-md px-4 text-xs font-semibold",
                  documentKind === "quotation" && "bg-[#184a96] text-white hover:bg-[#184a96]/90"
                )}
                onClick={() => setDocumentKind("quotation")}
              >
                Quotation
              </Button>
            </div>
          ) : (
            <span className="self-start rounded-md bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:self-end">
              {docLabels.title}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
          {isPreviewOnly ? (
            <Button variant="outline" asChild>
              <Link href={backToSavedInvoice}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href={savedListHref}>View Saved Invoices</Link>
          </Button>
          {!isPreviewOnly ? (
            <Button variant="outline" onClick={saveInvoiceToDatabase} className="gap-2" disabled={isSavingInvoice}>
              {isSavingInvoice ? "Saving..." : "Save Invoice"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            onClick={downloadAsPdf}
            className="gap-2 border-0 bg-[#1e5bb8] text-white hover:bg-[#1a4fa3] hover:text-white"
          >
            <FileDown className="h-4 w-4" />
            Download PDF
          </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {!isPreviewOnly ? (
        <Card className={cn("lg:col-span-5", themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("branding")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Branding</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.branding && "rotate-180")} />
              </button>
              {detailSectionVisible.branding ? (
            <div className="rounded-xl border border-dashed border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => logoInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" />
                  Upload logo
                </Button>
                <Button type="button" size="sm" variant="ghost" className="gap-2" onClick={clearLogo} disabled={!invoiceLogo}>
                  <RotateCcw className="h-4 w-4" />
                  Clear
                </Button>
                <span className={cn("text-xs", themeClasses.textNeutralSecondary)}>Saved on this device.</span>
              </div>
            </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("company")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Company</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.company && "rotate-180")} />
              </button>
              {detailSectionVisible.company ? (
              <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Company name</label>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-semibold", themeClasses.textNeutralSecondary)}>Tagline (e.g. CREATIVE AGENCY)</label>
                <Input
                  value={companyTagline}
                  onChange={(e) => setCompanyTagline(e.target.value)}
                  className="font-semibold tracking-wide"
                />
              </div>
            </div>
            <div>
              <label className={cn("mb-1 block text-xs font-bold", themeClasses.textNeutralSecondary)}>Website (small text, top-right under line)</label>
              <Input
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="example.com"
                className="font-semibold opacity-100"
              />
            </div>
              </>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("invoiceMeta")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{docLabels.metaSection}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.invoiceMeta && "rotate-180")} />
              </button>
              {detailSectionVisible.invoiceMeta ? (
            <div className="space-y-3">
              <div>
                <label className={cn("mb-1.5 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Document type</label>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={documentKind === "invoice" ? "default" : "ghost"}
                    className={cn(
                      "h-8 rounded-md px-4 text-xs font-semibold",
                      documentKind === "invoice" && "bg-[#184a96] text-white hover:bg-[#184a96]/90"
                    )}
                    onClick={() => setDocumentKind("invoice")}
                  >
                    Invoice
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={documentKind === "quotation" ? "default" : "ghost"}
                    className={cn(
                      "h-8 rounded-md px-4 text-xs font-semibold",
                      documentKind === "quotation" && "bg-[#184a96] text-white hover:bg-[#184a96]/90"
                    )}
                    onClick={() => setDocumentKind("quotation")}
                  >
                    Quotation
                  </Button>
                </div>
              </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>{docLabels.numberField}</label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Issue</label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>{docLabels.dueLabel.replace(/:$/, "")}</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("contacts")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Contacts</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.contacts && "rotate-180")} />
              </button>
              {detailSectionVisible.contacts ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className={cn("text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>From (contact)</p>
                <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="Email" type="email" />
                <Input value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} placeholder="Phone" />
              </div>
              <div className="space-y-2">
                <p className={cn("text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>{docLabels.billToLabel.replace(/:$/, "")}</p>
                <Input value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Client name" />
                <Textarea value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} placeholder="Address" rows={3} className="min-h-[72px] resize-y" />
                <Input value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} placeholder="Client email" type="email" />
                <Input value={billToPhone} onChange={(e) => setBillToPhone(e.target.value)} placeholder="Client phone" />
              </div>
            </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("items")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Items / project</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.items && "rotate-180")} />
              </button>
              {detailSectionVisible.items ? (hasProjectTables ? (
              <div className="space-y-4">
                <p className={cn("text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>
                  Project sections (editable)
                </p>
                {projectTables?.sections?.map((section, sectionIndex) => {
                  const prototypeSection = isPrototypeSectionTitle(section.title)
                  const editColumns = editableProjectColumns(section)
                  const projectRowGridClass = projectEditRowGridClass(section)
                  return (
                  <div key={section.title} className="space-y-2">
                  <div className="rounded-lg border border-border/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-700">{section.title}</p>
                      <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => addProjectSectionRow(sectionIndex)}>
                        <Plus className="h-3.5 w-3.5" />
                        Row
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {section.rows.map((row, rowIndex) => (
                        <div key={`${section.title}-${rowIndex}`} className={cn("grid grid-cols-1 gap-2", projectRowGridClass)}>
                          {editColumns.map((col) => {
                            const lineTotalK = lineTotalColumnKey(section)
                            const isAutoLineTotalField =
                              Boolean(lineTotalK && canAutoLineTotal(section) && col.key === lineTotalK)
                            return (
                              <Input
                                key={`${section.title}-${rowIndex}-${col.key}`}
                                value={row[col.key] || ""}
                                readOnly={isAutoLineTotalField}
                                onChange={(e) => updateProjectSectionCell(sectionIndex, rowIndex, col.key, e.target.value)}
                                placeholder={col.label}
                                className={cn(
                                  col.key === "item" && "min-w-0",
                                  isAutoLineTotalField && "cursor-default bg-muted/50 tabular-nums",
                                  prototypeSection && isPrototypeRowHighlighted(row) && "text-red-700"
                                )}
                              />
                            )
                          })}
                          <div className="flex items-center justify-end gap-2">
                            {prototypeSection ? (
                              <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={isPrototypeRowHighlighted(row)}
                                  onChange={(e) => togglePrototypeSectionRowHighlight(sectionIndex, rowIndex, e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Red
                              </label>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => removeProjectSectionRow(sectionIndex, rowIndex)}
                              aria-label="Remove row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                );
                })}
                {hasProjectTables && projectTables?.paymentSchedule?.length ? (
                  <div className="rounded-lg border border-border/80 p-3">
                    <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-700">Payment schedule</p>
                    <p className={cn("mb-3 text-[11px]", themeClasses.textNeutralSecondary)}>
                      Phases 1-2 use half of (invoice total - service), phases 3-4 use half of service. Edit deadlines here.
                    </p>
                    <div className="space-y-2">
                      {paymentScheduleDisplay.map((row, rowIndex) => (
                        <div
                          key={row.phase}
                          className="grid grid-cols-1 items-end gap-2 border-b border-border/60 pb-2 md:grid-cols-[2rem_1fr_4.5rem_1fr_1fr] md:items-center"
                        >
                          <p className="text-xs font-bold text-slate-800">{row.phase}</p>
                          <p className="text-xs text-slate-600 md:pr-1">{row.description}</p>
                          <p className="text-right text-xs font-semibold text-slate-800">{row.amount}</p>
                          <p className="text-right text-xs font-semibold tabular-nums text-slate-900">{money(row.amountToPay)}</p>
                          <Input
                            value={row.deadline}
                            onChange={(e) => updatePaymentScheduleCell(rowIndex, "deadline", e.target.value)}
                            onBlur={() => normalizePaymentScheduleDeadlineOnBlur(rowIndex)}
                            placeholder="Deadline (DD/MM/YYYY)"
                            maxLength={10}
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <label className={cn("mb-1 block text-[10px] font-medium uppercase", themeClasses.textNeutralSecondary)}>Total duration (FINAL row, last column)</label>
                      <Input
                        value={computedPaymentDuration}
                        readOnly
                        placeholder="Auto from schedule dates"
                        className="h-8 cursor-default bg-muted/50 text-sm"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className={cn("text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>Line items</p>
                  <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 rounded-lg border border-border/80 bg-muted/20 p-2 dark:bg-muted/10">
                    <Input
                      className="col-span-12 sm:col-span-5"
                      value={item.description}
                      placeholder="Description"
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={1}
                      className="col-span-4 sm:col-span-2"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                    <Input
                      type="number"
                      min={0}
                      className="col-span-5 sm:col-span-4"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="Unit"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="col-span-3 sm:col-span-1"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <p className="col-span-12 text-right text-xs font-medium tabular-nums text-muted-foreground">
                      Line total: {money(item.quantity * item.unitPrice)}
                    </p>
                  </div>
                ))}
              </div>
            )) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("totals")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Totals</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.totals && "rotate-180")} />
              </button>
              {detailSectionVisible.totals ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Currency</label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Tax %</label>
                <Input type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Discount</label>
                <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("paymentMethods")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Payment methods</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.paymentMethods && "rotate-180")} />
              </button>
              {detailSectionVisible.paymentMethods ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className={cn("text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>Payment methods</p>
                <Button type="button" size="sm" variant="outline" onClick={addPaymentMethod} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add method
                </Button>
              </div>
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className={cn(
                    "rounded-lg border border-border/80 bg-muted/15 p-3 dark:bg-muted/10",
                    paymentMethods.length > 1 && "relative"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">Option</span>
                    {paymentMethods.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removePaymentMethod(pm.id)}
                        aria-label="Remove payment method"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    className="mb-2"
                    value={pm.title}
                    onChange={(e) => updatePaymentMethod(pm.id, { title: e.target.value })}
                    placeholder="Label (e.g. CRDB, M-Pesa) — optional"
                  />
                  <Input
                    className="mb-2"
                    value={pm.accountName}
                    onChange={(e) => updatePaymentMethod(pm.id, { accountName: e.target.value })}
                    placeholder="Account name"
                  />
                  <Input
                    className="mb-2"
                    value={pm.bank}
                    onChange={(e) => updatePaymentMethod(pm.id, { bank: e.target.value })}
                    placeholder="Bank or provider"
                  />
                  <Input
                    value={pm.account}
                    onChange={(e) => updatePaymentMethod(pm.id, { account: e.target.value })}
                    placeholder="Account or reference number"
                  />
                </div>
              ))}
            </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("terms")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Terms</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.terms && "rotate-180")} />
              </button>
              {detailSectionVisible.terms ? (
                <>
            <div>
              <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Thank you line</label>
              <Input value={thankYouLine} onChange={(e) => setThankYouLine(e.target.value)} />
            </div>
            <div>
              <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Terms and conditions</label>
              <p className={cn("mb-1 text-[11px]", themeClasses.textNeutralSecondary)}>Use Ctrl+B to wrap selected text in bold.</p>
              <Textarea
                ref={termsTextareaRef}
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                onKeyDown={handleTermsKeyDown}
                rows={3}
                className="resize-y"
              />
            </div>
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("signer")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Signer</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.signer && "rotate-180")} />
              </button>
              {detailSectionVisible.signer ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>
                  Signer label (italic line, e.g. Authorized Signatory)
                </label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", themeClasses.textNeutralSecondary)}>Title (e.g. Administrator)</label>
                <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
              </div>
            </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("signatureStamp")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Signature & stamp</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.signatureStamp && "rotate-180")} />
              </button>
              {detailSectionVisible.signatureStamp ? (
                <>
            <p className={cn("mt-2 text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>Digital signature & company stamp</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-dashed border-border p-2">
                <p className="mb-1.5 text-xs text-muted-foreground">Digital signature (shown above stamp in signature area)</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSignatureUpload}
                  />
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => signatureInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" />
                    Upload signature
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearSignature} disabled={!signatureImage}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
                {signatureImage ? (
                  <img src={signatureImage} alt="" className="mt-2 h-16 w-auto max-w-full object-contain" />
                ) : null}
              </div>
              <div className="rounded-lg border border-dashed border-border p-2">
                <p className="mb-1.5 text-xs text-muted-foreground">Company stamp (use PNG with transparent background; shown below signature)</p>
                <div className="flex flex-wrap gap-2">
                  <input ref={stampInputRef} type="file" accept="image/png,image/webp,image/*" className="hidden" onChange={handleStampUpload} />
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => stampInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" />
                    Upload stamp
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearStamp} disabled={!stampImage}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
                {stampImage ? (
                  <div className="mt-2 flex justify-center rounded-md bg-slate-100/80 p-2 dark:bg-slate-800/50">
                    <img src={stampImage} alt="" className="h-32 w-auto max-w-full object-contain" />
                  </div>
                ) : null}
              </div>
            </div>
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-left"
                onClick={() => toggleDetailSection("footer")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Footer</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailSectionVisible.footer && "rotate-180")} />
              </button>
              {detailSectionVisible.footer ? (
                <>
            <p className={cn("text-xs font-semibold uppercase tracking-wide", themeClasses.textNeutralSecondary)}>Footer contact (icons row)</p>
            <div className="grid grid-cols-1 gap-2">
              <Input value={footerPhone} onChange={(e) => setFooterPhone(e.target.value)} placeholder="Phone" />
              <Input value={footerEmail} onChange={(e) => setFooterEmail(e.target.value)} placeholder="Email" />
              <Input value={footerAddress} onChange={(e) => setFooterAddress(e.target.value)} placeholder="Address" />
            </div>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
        ) : null}

        <Card className={cn("print:shadow-none", isPreviewOnly ? "lg:col-span-12" : "lg:col-span-7", themeClasses.cardBg, themeClasses.cardBorder, "shadow-sm")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Live preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "relative overflow-hidden rounded-lg border text-slate-900",
                isPreviewOnly && "mx-auto w-full max-w-4xl"
              )}
              style={{
                background: "#fff",
                borderColor: "rgba(15, 23, 42, 0.22)",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05), 0 3px 10px rgba(15, 23, 42, 0.07)",
              }}
            >
              <div className="relative z-10">
              {/* Header */}
              <div className="flex flex-col justify-between gap-4 px-6 pb-0 pt-6 sm:flex-row sm:items-start">
                <div className="flex items-center gap-3 sm:gap-4">
                  {invoiceLogo ? (
                    <img
                      src={invoiceLogo}
                      alt=""
                      className="h-[72px] w-auto max-w-[128px] object-contain"
                    />
                  ) : (
                    <div
                      className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-2 border-dashed text-[10px] text-slate-400"
                      style={{ borderColor: "#cbd5e1" }}
                    >
                      Logo
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">
                      {fromName || "Your company"}
                    </p>
                    <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300">
                      {companyTagline}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "font-extrabold tracking-wide sm:pt-0",
                    documentKind === "quotation" ? "text-3xl sm:text-4xl" : "text-4xl"
                  )}
                  style={{ color: INV.blue }}
                >
                  {docLabels.title}
                </div>
              </div>

              {/* Line + URL */}
              <div className="relative mt-3 px-6">
                <div className="h-px w-full" style={{ background: INV.lineGray }} />
                <div className="absolute left-6 top-0 h-[3px] w-24" style={{ background: INV.blue }} />
                <p className="pt-1.5 text-right text-[9px] font-semibold normal-case leading-snug tracking-normal text-slate-600 opacity-100 dark:text-slate-400 sm:text-[10px]">
                  {websiteDisplay}
                </p>
              </div>

              {/* Invoice to + meta */}
              <div className="mt-4 grid grid-cols-1 gap-6 px-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-slate-900">{docLabels.billToLabel}</p>
                  <p className="mt-1 text-[15px] font-extrabold text-slate-900">{billToName || "Client name"}</p>
                  {billToAddress && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{billToAddress}</p>}
                  {billToEmail && <p className="text-xs text-slate-500">{billToEmail}</p>}
                  {billToPhone && <p className="mt-0.5 text-xs text-slate-500">{billToPhone}</p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-extrabold text-slate-900">{docLabels.numberLabel} {invoiceNumber}</p>
                  <p className="mt-1 text-sm text-slate-900">{formatLongDate(issueDate)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{docLabels.dueLabel} {formatLongDate(dueDate)}</p>
                </div>
              </div>

              {!hasProjectTables ? (
                <div className="mt-5 overflow-x-auto border border-slate-300">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: columnWidthForKey("sn") }} />
                      <col style={{ width: columnWidthForKey("item") }} />
                      <col style={{ width: columnWidthForKey("qty") }} />
                      <col style={{ width: columnWidthForKey("unitPrice") }} />
                      <col style={{ width: columnWidthForKey("totalPrice") }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: INV.blue }}>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          NO
                        </th>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          DESCRIPTION
                        </th>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          QTY
                        </th>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          PRICE ({currency})
                        </th>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          TOTAL ({currency})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        const rowTotal = item.quantity * item.unitPrice
                        const stripe = index % 2 === 1
                        return (
                          <tr key={item.id} style={{ background: stripe ? INV.rowStripe : "#fff" }}>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-center text-xs text-slate-800 sm:px-3.5">
                              {index + 1}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-sm font-medium text-slate-900 sm:px-3.5">
                              {item.description || "—"}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-right text-sm text-slate-700 sm:px-3.5">
                              {item.quantity}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-right text-sm tabular-nums text-slate-700 sm:px-3.5">
                              {money(item.unitPrice)}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900 sm:px-3.5">
                              {money(rowTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {projectTables?.sections?.map((section) => {
                const prototypeSection = isPrototypeSectionTitle(section.title)
                return (
                <div key={section.title} className="mt-2 px-6">
                  <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-900">{section.title}</p>
                  <div className="overflow-x-auto border border-slate-300">
                    <table className="min-w-full table-fixed border-collapse">
                      <colgroup>
                        {section.columns.map((col) => (
                          <col key={`${section.title}-${col.key}-w`} style={{ width: columnWidthForKey(col.key) }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr style={{ background: INV.blue }}>
                          {section.columns.map((col) => (
                            <th
                              key={col.key}
                              className={cn(
                                "border border-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-white",
                                col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                              )}
                            >
                              {columnHeaderLabel(col, currency)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, index) => (
                          <tr key={`${section.title}-${index}`} style={{ background: index % 2 === 1 ? INV.rowStripe : "#fff" }}>
                            {section.columns.map((col) => (
                              <td
                                key={`${section.title}-${index}-${col.key}`}
                                className={cn(
                                  "border border-slate-200 px-3 py-1.5 text-xs",
                                  prototypeSection && isPrototypeRowHighlighted(row) ? "text-red-700" : "text-slate-800",
                                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                )}
                              >
                                {displayProjectTableCell(row, col, index, currency)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={Math.max(1, section.columns.length - 1)} className="border border-slate-200 px-3 py-1.5 text-right text-xs font-extrabold text-slate-900">
                            SUBTOTAL
                          </td>
                          <td className="border border-slate-200 px-3 py-1.5 text-right text-xs font-extrabold tabular-nums text-slate-900">
                            {money(getSectionSubtotal(section))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                )
              })}

              <div className="mt-0 flex flex-col gap-4 border-t border-slate-200 bg-white px-6 pb-2 pt-5">
                <div className="ml-auto w-full max-w-[240px]">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Sub Total :</span>
                    <span className="font-medium tabular-nums text-slate-900">{currency} {money(effectiveSubtotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-600">
                    <span>Tax {taxRate}% :</span>
                    <span className="font-medium tabular-nums text-slate-900">{currency} {money(effectiveTaxAmount)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="mt-1 flex justify-between text-xs text-slate-600">
                      <span>Discount :</span>
                      <span className="font-medium tabular-nums text-slate-900">{currency} {money(discount)}</span>
                    </div>
                  )}
                  <div
                    className="mt-2 flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white"
                    style={{ background: INV.blue }}
                  >
                    <span>GRAND TOTAL :</span>
                    <span className="tabular-nums">{currency} {money(effectiveGrandTotal)}</span>
                  </div>
                </div>
              </div>

              {hasProjectTables && paymentScheduleDisplay.length ? (
                <div className="mt-2 px-6">
                  <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-900">PAYMENT SCHEDULE</p>
                  <div className="overflow-x-auto border border-slate-300">
                    <table className="min-w-full border-collapse">
                      <colgroup>
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "45%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "15%" }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: INV.blue }}>
                          <th className="border border-blue-700 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.07em] text-white">Phase</th>
                          <th className="border border-blue-700 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-white">Description</th>
                          <th className="border border-blue-700 px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-white">Amount</th>
                          <th className="border border-blue-700 px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-white">
                            Amount to pay ({currency})
                          </th>
                          <th className="border border-blue-700 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.07em] text-white">Deadline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentScheduleDisplay.map((row, index) => (
                          <tr key={`schedule-${row.phase}`} style={{ background: index % 2 === 1 ? INV.rowStripe : "#fff" }}>
                            <td className="border border-slate-200 px-3 py-1.5 text-center text-xs text-slate-800">{row.phase}</td>
                            <td className="border border-slate-200 px-3 py-1.5 text-xs text-slate-800">{row.description}</td>
                            <td className="border border-slate-200 px-3 py-1.5 text-right text-xs text-slate-800">{row.amount}</td>
                            <td className="border border-slate-200 px-3 py-1.5 text-right text-xs tabular-nums text-slate-800">
                              {money(row.amountToPay)}
                            </td>
                            <td className="border border-slate-200 px-3 py-1.5 text-center text-xs text-slate-800">{row.deadline}</td>
                          </tr>
                        ))}
                        <tr style={{ background: INV.rowStripe }}>
                          <td className="border border-slate-200 px-3 py-1.5 text-center text-xs font-extrabold text-slate-900">FINAL</td>
                          <td className="border border-slate-200 px-3 py-1.5 text-xs" />
                          <td className="border border-slate-200 px-3 py-1.5 text-right text-xs font-extrabold text-slate-900">100%</td>
                          <td className="border border-slate-200 px-3 py-1.5 text-right text-xs font-extrabold tabular-nums text-slate-900">
                            {money(materialSubtotalForSchedule + serviceSubtotalForSchedule)}
                          </td>
                          <td className="border border-slate-200 px-3 py-1.5 text-center text-xs font-extrabold text-slate-900">
                            {computedPaymentDuration}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 px-6">
                <div className="w-full max-w-md self-start text-left">
                  <div className="w-full max-w-md">
                    <p className="border-b border-slate-200 pb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-800 dark:border-slate-600 dark:text-slate-200">
                      Payment method
                    </p>
                    <div
                      className="mt-2 space-y-3 border-l-4 pl-3 text-sm text-slate-800 dark:text-slate-200"
                      style={{ borderLeftColor: INV.blue }}
                    >
                      {paymentMethods.map((pm, index) => (
                        <div
                          key={pm.id}
                          className={cn(index > 0 && "border-t border-slate-200 pt-3 dark:border-slate-600")}
                        >
                          {pm.title.trim() ? (
                            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              {pm.title.trim()}
                            </p>
                          ) : null}
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account name</span>
                            <span className="font-bold text-slate-900">{pm.accountName || "—"}</span>
                          </div>
                          <div className="mt-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Bank</span>
                            <span className="font-bold text-slate-900">{pm.bank || "—"}</span>
                          </div>
                          <div className="mt-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account</span>
                            <span className="font-bold text-slate-900">{pm.account || "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms + signature */}
              <div className="mt-2 grid grid-cols-1 gap-6 border-t border-slate-100 px-6 py-5 sm:grid-cols-[1fr_auto]">
                <div className="text-xs leading-relaxed text-slate-600">
                  <p className="font-extrabold text-slate-900">{thankYouLine}</p>
                  <h4 className="mt-3 text-xs font-extrabold text-slate-900">Term and Conditions:</h4>
                  <p
                    className="mt-1 whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: convertInlineBoldToHtml(termsText || "—") }}
                  />
                </div>
                <div className="w-full max-w-[280px] text-left sm:ml-auto sm:text-right">
                  <p
                    className="font-['Georgia',serif] text-lg italic text-slate-700"
                  >
                    {signerName}
                  </p>
                  {signatureImage ? (
                    <div className="mt-2 flex justify-end">
                      <img src={signatureImage} alt="" className="block h-16 w-auto max-w-[170px] object-contain" />
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">{signerTitle}</p>
                  {stampImage ? (
                    <img
                      src={stampImage}
                      alt=""
                      className="ml-auto mt-2 block h-36 w-auto max-w-[280px] object-contain opacity-95"
                    />
                  ) : null}
                </div>
              </div>

              {/* Bottom bar + contacts */}
              <div className="relative px-6 pb-5 pt-0">
                <div className="h-px w-full" style={{ background: INV.lineGray }} />
                <div className="absolute right-6 top-0 h-[3px] w-24" style={{ background: INV.blue }} />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-4">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border-2"
                      style={{ borderColor: INV.blue, color: INV.blue }}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </span>
                    {footerPhone}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border-2"
                      style={{ borderColor: INV.blue, color: INV.blue }}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    {footerEmail}
                  </div>
                  <div className="flex min-w-0 items-start gap-2 text-xs text-slate-600">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border-2"
                      style={{ borderColor: INV.blue, color: INV.blue }}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <span className="break-words pt-0.5">{footerAddress}</span>
                  </div>
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
