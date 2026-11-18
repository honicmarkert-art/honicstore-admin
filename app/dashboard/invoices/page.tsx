"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus, Printer, Trash2, Sparkles, FileDown, ImagePlus, RotateCcw, Phone, Mail, MapPin, ChevronDown, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getDeliveryNotePreset, getDeliveryNotePresetByReference, applyDocumentPricesToItems, presetToSourceLinePrices, type SourceLinePrice } from "@/lib/delivery-note-presets"
import { isAutoCategoryReference, referenceMatchesCategory } from "@/lib/project-reference"
import { LOGO_PUBLIC_URL, COMPANY_ADDRESS_DEFAULT, COMPANY_ADDRESS_FOOTER } from "@/lib/technical-report-defaults"
import { previousProjectPage } from "@/lib/project-page-history"
import { readSessionCache, writeSessionCache } from "@/lib/session-read-cache"
import { useTheme } from "@/hooks/use-theme"
import { useToast } from "@/hooks/use-toast"

type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

type SavedLineItemCatalogEntry = {
  key: string
  name: string
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
  fromAddress?: string
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
  /** When true, section is omitted from preview, PDF, and totals. */
  hidden?: boolean
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
  /** When true, payment schedule table is hidden on preview/PDF (invoice mode only). */
  hidePaymentSchedule?: boolean
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

type DocumentKind = "invoice" | "quotation" | "delivery_note"

const DOCUMENT_DEFAULTS: Record<
  DocumentKind,
  { thankYou: string; terms: string; disclaimer: string }
> = {
  invoice: {
    thankYou: "Thank you for your business.",
    terms: "Payment is due within 7 days. Please use the invoice number as your payment reference.",
    disclaimer: "",
  },
  quotation: {
    thankYou: "Thank you for considering our proposal.",
    terms:
      "This document is a quotation only — not a tax invoice. No payment is due until a formal invoice is issued upon acceptance.\n\nThis quotation is valid until the date shown above. Prices are estimates and subject to availability. Written acceptance is required before work or supply begins.",
    disclaimer: "",
  },
  delivery_note: {
    thankYou: "Please verify all items listed below upon receipt.",
    terms:
      "This delivery note confirms the items and quantities shipped. It is not an invoice and does not request payment.\n\nPlease check goods against your order. Note any missing, damaged, or incorrect items on the proof of receipt section and sign to confirm delivery.",
    disclaimer: "",
  },
}

function documentKindLabels(kind: DocumentKind) {
  const isQuote = kind === "quotation"
  const isDelivery = kind === "delivery_note"
  const defs = DOCUMENT_DEFAULTS[kind]
  return {
    title: isDelivery ? "DELIVERY NOTE" : isQuote ? "QUOTATION" : "INVOICE",
    subtitle: isDelivery
      ? "Shipping document — not an invoice"
      : isQuote
        ? "Price estimate — not a tax invoice"
        : "",
    numberLabel: isDelivery ? "Delivery note no :" : isQuote ? "Quotation no :" : "Invoice no :",
    billToLabel: isDelivery ? "Deliver to:" : isQuote ? "Quotation for:" : "Invoice to:",
    dueLabel: isDelivery ? "Delivery date:" : isQuote ? "Valid until:" : "Due:",
    issueDateLabel: isDelivery ? "Note date:" : isQuote ? "Quotation date:" : "Issue date:",
    referenceLabel: isDelivery ? "Order / PO reference:" : isQuote ? "" : "Report Ref No :",
    metaSection: isDelivery ? "Delivery details" : isQuote ? "Quotation meta" : "Invoice meta",
    numberField: isDelivery ? "Delivery Note #" : isQuote ? "Quotation #" : "Invoice #",
    grandTotalLabel: isDelivery ? "TOTAL VALUE :" : isQuote ? "QUOTED TOTAL :" : "GRAND TOTAL :",
    termsHeading: isDelivery ? "Delivery instructions:" : isQuote ? "Quotation terms:" : "Term and Conditions:",
    thankYouDefault: defs.thankYou,
    termsDefault: defs.terms,
    disclaimerDefault: defs.disclaimer,
    showPrices: true,
    showTotals: true,
    showMarkColumn: isDelivery,
    showPaymentSchedule: kind === "invoice",
    showPaymentMethods: kind === "invoice",
    showStamp: !isDelivery,
    saveButtonLabel: isDelivery ? "Save Delivery Note" : isQuote ? "Save Quotation" : "Save Invoice",
    termsSectionLabel: isDelivery ? "Delivery notes" : isQuote ? "Quotation terms" : "Terms",
    thankYouFieldLabel: isQuote ? "Closing line" : "Thank you line",
    termsFieldLabel: isDelivery
      ? "Delivery instructions & notes"
      : isQuote
        ? "Quotation terms & conditions"
        : "Terms and conditions",
    acceptanceHeading: isQuote
      ? "Client acceptance"
      : isDelivery
        ? "Proof of receipt"
        : "Client approval — sign & stamp",
    preparedByLabel: isQuote ? "Prepared by:" : "",
  }
}

function isMoneyColumnKey(key: string): boolean {
  return /price|amount|total|subtotal/i.test(key) && key !== "qty"
}

function deliveryNoteColumns(columns: ExtraTableColumn[]): ExtraTableColumn[] {
  if (columns.some((col) => col.key === "mark")) return columns
  return [...columns, { key: "mark", label: "Mark", align: "center" as const }]
}

function markCellHtml(): string {
  return `<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #334155;"></span>`
}

function extractSourceLinePricesFromPayload(payload: Record<string, any>): SourceLinePrice[] {
  const items: SourceLinePrice[] = []
  if (Array.isArray(payload.items)) {
    for (const it of payload.items) {
      const description = String(it?.description || it?.item || "").trim()
      if (!description) continue
      items.push({
        description,
        quantity: Number(it?.quantity || it?.qty || 0),
        unitPrice: Number(it?.unitPrice || 0),
      })
    }
  }
  const sections = payload?.projectTables?.sections
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const rows = Array.isArray(section?.rows) ? section.rows : []
      for (const row of rows) {
        const description = String(row?.item || row?.description || "").trim()
        if (!description) continue
        const qty = Number(String(row?.qty || row?.quantity || "0").replace(/,/g, "")) || 0
        const unitRaw = row?.unitPrice || row?.price
        let unitPrice = Number(String(unitRaw || "0").replace(/,/g, "")) || 0
        if (!unitPrice && row?.totalPrice && qty > 0) {
          unitPrice = Number(String(row.totalPrice).replace(/,/g, "")) / qty
        }
        if (!unitPrice && row?.amount && qty > 0) {
          unitPrice = Number(String(row.amount).replace(/,/g, "")) / qty
        }
        items.push({ description, quantity: qty, unitPrice })
      }
    }
  }
  return items
}

async function fetchSourceLinePrices(referenceNumber: string): Promise<SourceLinePrice[]> {
  const ref = referenceNumber.trim()
  if (!ref) return []

  const preset = getDeliveryNotePresetByReference(ref)
  if (preset) return presetToSourceLinePrices(preset)

  try {
    const res = await fetch(`/api/admin/invoices?invoiceNumber=${encodeURIComponent(ref)}`, {
      cache: "no-store",
      credentials: "include",
    })
    const data = await res.json()
    if (!res.ok || !data?.invoice?.payload) return []
    return extractSourceLinePricesFromPayload(data.invoice.payload as Record<string, any>)
  } catch {
    return []
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

function SavedItemPicker({
  items,
  onSelect,
  disabled,
  className,
  hidePrices = false,
}: {
  items: SavedLineItemCatalogEntry[]
  onSelect: (item: SavedLineItemCatalogEntry) => void
  disabled?: boolean
  className?: string
  hidePrices?: boolean
}) {
  return (
    <select
      disabled={disabled || items.length === 0}
      defaultValue=""
      onChange={(e) => {
        const key = e.target.value
        if (!key) return
        const found = items.find((item) => item.key === key)
        if (found) onSelect(found)
        e.target.value = ""
      }}
      className={cn(
        "h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      aria-label="Pick a previously saved item"
    >
      <option value="">{items.length ? "Pick saved item…" : "No saved items yet"}</option>
      {items.map((item) => (
        <option key={item.key} value={item.key}>
          {hidePrices ? `${item.name} (qty ${item.quantity})` : `${item.name} (${item.quantity} × ${money(item.unitPrice)})`}
        </option>
      ))}
    </select>
  )
}

function isPrototypeSectionTitle(title: string): boolean {
  return /prototype/i.test(String(title || ""))
}

function isProjectSectionVisible(section: ExtraTableSection): boolean {
  return section.hidden !== true
}

function visibleProjectSections(sections: ExtraTableSection[] | undefined): ExtraTableSection[] {
  return (sections || []).filter(isProjectSectionVisible)
}

function isPaymentScheduleVisible(projectTables: InvoiceExtraTables | undefined, showForDocKind: boolean): boolean {
  if (!showForDocKind) return false
  if (!projectTables?.paymentSchedule?.length) return false
  return projectTables.hidePaymentSchedule !== true
}

function isPrototypeRowHighlighted(row: Record<string, string>): boolean {
  const v = String(row?.[PROTOTYPE_RED_KEY] || "").toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

function convertInlineBoldToHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}

function SheetField({
  value,
  onChange,
  editable,
  className,
  multiline,
  placeholder,
  inputMode,
}: {
  value: string
  onChange?: (value: string) => void
  editable: boolean
  className?: string
  multiline?: boolean
  placeholder?: string
  inputMode?: "text" | "decimal" | "numeric"
}) {
  if (!editable) {
    if (!value.trim()) return null
    return <span className={cn("whitespace-pre-line", className)}>{value}</span>
  }
  const fieldClass = cn(
    "sheet-field box-border w-full min-w-0 rounded-sm border-0 bg-transparent p-0 text-inherit shadow-none outline-none ring-0 placeholder:text-slate-400 focus:bg-sky-50 print:bg-transparent",
    className
  )
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        rows={Math.max(2, value.split("\n").length || 2)}
        className={cn(fieldClass, "resize-y")}
      />
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className={fieldClass}
    />
  )
}

function columnWidthForKey(key: string): string {
  if (key === "sn") return "9%"
  if (key === "item") return "43%"
  if (key === "qty") return "12%"
  if (key === "unitPrice") return "18%"
  if (key === "totalPrice" || key === "amount") return "18%"
  if (key === "mark") return "8%"
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

function isExampleCellValue(value: string): boolean {
  return /^\s*e\.g\./i.test(String(value || ""))
}

function sheetCellValue(value: string): string {
  return isExampleCellValue(value) ? "" : String(value || "")
}

function sheetCellPlaceholder(value: string, fallback: string): string {
  const raw = String(value || "").trim()
  return isExampleCellValue(raw) ? raw : fallback
}

function projectRowLineAmount(section: ExtraTableSection, row: Record<string, string>): number {
  if (!canAutoLineTotal(section)) {
    const totalK = lineTotalColumnKey(section)
    if (!totalK) return 0
    const raw = row[totalK] || ""
    if (isExampleCellValue(raw)) return 0
    return parseMoneyInput(raw)
  }
  const qtyRaw = row.qty || ""
  const priceRaw = row.unitPrice || ""
  if (isExampleCellValue(qtyRaw) || isExampleCellValue(priceRaw)) return 0
  const qty = parseQtyInput(qtyRaw)
  const unit = parseMoneyInput(priceRaw)
  if (qty <= 0 || unit <= 0) return 0
  return qty * unit
}

function displayProjectTableCell(
  row: Record<string, string>,
  col: ExtraTableColumn,
  rowIndex: number,
  currency: string,
  section?: ExtraTableSection
): string {
  if (isSerialColumnKey(col.key)) return String(rowIndex + 1)
  if (col.key === "mark") return ""
  if (section && canAutoLineTotal(section) && lineTotalColumnKey(section) === col.key) {
    return money(projectRowLineAmount(section, row))
  }
  if (isExampleCellValue(row[col.key] ?? "")) return ""
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
  return { ...row, [totalK]: money(projectRowLineAmount(section, row)) }
}

function isExampleProjectRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => /e\.g\./i.test(String(value || "")))
}

function projectSectionBucket(title: string): "electrical" | "prototype" | "service" | "other" {
  const text = title.toLowerCase()
  if (text.includes("service")) return "service"
  if (text.includes("prototype")) return "prototype"
  if (text.includes("electric") || text.includes("component")) return "electrical"
  return "other"
}

function lineBelongsToSection(lineSection: string, sectionTitle: string): boolean {
  const line = lineSection.toLowerCase().trim()
  const title = sectionTitle.toLowerCase().trim()
  if (!line || line === "items") return false
  if (title.includes(line) || line.includes(title)) return true
  const lineBucket = projectSectionBucket(line)
  const titleBucket = projectSectionBucket(title)
  return lineBucket !== "other" && lineBucket === titleBucket
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

/** Payment schedule ends on 25 July; phases are spaced evenly from issue date to that date. */
const SCHEDULE_END_MONTH = 6
const SCHEDULE_END_DAY = 25
const PAYMENT_SCHEDULE_PHASE_COUNT = 4

function formatScheduleDeadlineDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = String(d.getFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

function getPaymentScheduleEndDate(start: Date): Date {
  const afterEnd =
    start.getMonth() > SCHEDULE_END_MONTH ||
    (start.getMonth() === SCHEDULE_END_MONTH && start.getDate() > SCHEDULE_END_DAY)
  const endYear = afterEnd ? start.getFullYear() + 1 : start.getFullYear()
  return new Date(endYear, SCHEDULE_END_MONTH, SCHEDULE_END_DAY, 12, 0, 0, 0)
}

function computeAutoScheduleDeadlines(issueDateIso: string, phases = PAYMENT_SCHEDULE_PHASE_COUNT): string[] {
  const start = new Date(`${issueDateIso}T12:00:00`)
  if (Number.isNaN(start.getTime())) return Array(phases).fill("")
  const end = getPaymentScheduleEndDate(start)
  const startMs = start.getTime()
  const endMs = end.getTime()
  const span = endMs - startMs
  if (span <= 0) {
    const fmt = formatScheduleDeadlineDate(end)
    return Array(phases).fill(fmt)
  }
  return Array.from({ length: phases }, (_, i) => {
    const t = startMs + (span * (i + 1)) / phases
    return formatScheduleDeadlineDate(new Date(t))
  })
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
  initialDocumentKind,
  lockDocumentKind = false,
}: {
  initialValues?: InvoiceInitialValues
  extraTables?: InvoiceExtraTables
  dashboardScope?: "main" | "project"
  savedListHref?: string
  initialDocumentKind?: DocumentKind
  lockDocumentKind?: boolean
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
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [documentKind, setDocumentKind] = useState<DocumentKind>(initialDocumentKind || "invoice")
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [fromName, setFromName] = useState(initialValues?.fromName ?? "Honic Company Store")
  const [companyTagline, setCompanyTagline] = useState(initialValues?.companyTagline ?? "ONLINE RETAIL")
  const [fromEmail, setFromEmail] = useState("support@honiccompany.com")
  const [fromPhone, setFromPhone] = useState("+255 786 957 939")
  const [fromAddress, setFromAddress] = useState(initialValues?.fromAddress ?? COMPANY_ADDRESS_DEFAULT)
  const [companyWebsite, setCompanyWebsite] = useState(initialValues?.companyWebsite ?? "honiccompanystore.com")
  const [invoiceLogo, setInvoiceLogo] = useState<string>(LOGO_PUBLIC_URL)
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
  const [signerTitle, setSignerTitle] = useState("Abdulaziz Halekwa G.")
  const [footerPhone, setFooterPhone] = useState("+255 786 957 939")
  const [footerEmail, setFooterEmail] = useState("support@honiccompany.com")
  const [footerAddress, setFooterAddress] = useState(COMPANY_ADDRESS_FOOTER)
  const [currency, setCurrency] = useState("TZS")
  const [taxRate, setTaxRate] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [thankYouLine, setThankYouLine] = useState("Thank you for your business.")
  const [quotationScope, setQuotationScope] = useState("")
  const [itemsTableTitle, setItemsTableTitle] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [backorderedNote, setBackorderedNote] = useState("")
  const [showClientApproval, setShowClientApproval] = useState(false)
  const [projectCategory, setProjectCategory] = useState("")
  const nextReferenceCache = useRef<Record<string, string>>({})
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: "1",
      description: initialDocumentKind === "delivery_note" ? "Item description" : "Product or service",
      quantity: 1,
      unitPrice: 0,
    },
  ])
  const [savedItemCatalog, setSavedItemCatalog] = useState<SavedLineItemCatalogEntry[]>([])
  const [isLoadingSavedItems, setIsLoadingSavedItems] = useState(false)
  const [projectTables, setProjectTables] = useState<InvoiceExtraTables | undefined>(extraTables)
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [aiBrief, setAiBrief] = useState("")
  const [aiImage, setAiImage] = useState<{ mimeType: string; data: string; preview: string } | null>(null)
  const [aiDragOver, setAiDragOver] = useState(false)
  const [isAiFilling, setIsAiFilling] = useState(false)
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
  const backToSavedInvoice = savedInvoiceId ? `${savedListHref}/${savedInvoiceId}?tab=preview` : savedListHref

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
        const savedKind = String(p.documentKind || "invoice")
        setDocumentKind(savedKind === "quotation" || savedKind === "delivery_note" ? (savedKind as DocumentKind) : "invoice")
        setIssueDate(String(inv?.issue_date || p.issueDate || ""))
        setDueDate(String(inv?.due_date || p.dueDate || ""))
        setCurrency(String(inv?.currency || p.currency || "TZS"))
        setTaxRate(Number(p.taxRate || 0))
        setDiscount(Number(p.discount || 0))
        setBillToName(String(inv?.client_name || p.clientName || ""))
        setBillToEmail(String(p.clientEmail || ""))
        setBillToPhone(String(p.clientPhone || ""))
        setBillToAddress(String(p.clientAddress || ""))
        setProjectCategory(["fyp", "side", "research"].includes(String(p.projectCategory)) ? String(p.projectCategory) : "")
        setFromName(String(p.fromName || fromName))
        setFromEmail(String(p.fromEmail || fromEmail))
        setFromPhone(String(p.fromPhone || fromPhone))
        setFromAddress(String(p.fromAddress || fromAddress || COMPANY_ADDRESS_DEFAULT))
        setCompanyWebsite(String(p.companyWebsite || companyWebsite))
        setCompanyTagline(String(p.companyTagline || companyTagline))
        setSignerName(String(p.signerName || signerName))
        setSignerTitle(String(p.signerTitle || "") === "Administrator" || !String(p.signerTitle || "").trim() ? "Abdulaziz Halekwa G." : String(p.signerTitle))
        setFooterPhone(String(p.footerPhone || footerPhone))
        setFooterEmail(String(p.footerEmail || footerEmail))
        setFooterAddress(String(p.footerAddress || footerAddress))
        setThankYouLine(String(p.thankYouLine || thankYouLine))
        setTermsText(String(p.termsText || termsText))
        setQuotationScope(String(p.quotationScope || ""))
        setItemsTableTitle(String(p.itemsTableTitle || ""))
        setReferenceNumber(String(p.referenceNumber || p.linkedTechnicalReport || ""))
        setShowClientApproval(p.showClientApproval === true)
        setBackorderedNote(String(p.backorderedNote || ""))
        if (p.documentKind === "quotation" && p.quotationDisclaimer && typeof p.termsText === "string") {
          const disc = String(p.quotationDisclaimer)
          const terms = String(p.termsText || "")
          if (disc && !terms.includes(disc)) {
            setTermsText(terms.trim() ? `${disc}\n\n${terms}` : disc)
          }
        }
        if (typeof p.invoiceLogo === "string" && p.invoiceLogo) setInvoiceLogo(p.invoiceLogo)
        else setInvoiceLogo(LOGO_PUBLIC_URL)
        if (typeof p.signatureImage === "string" && p.signatureImage) setSignatureImage(p.signatureImage)
        setStampImage(typeof p.stampImage === "string" ? p.stampImage : "")

        let loadedItems: InvoiceItem[] = []
        if (Array.isArray(p.items) && p.items.length) {
          loadedItems = p.items.map((it: any, idx: number) => ({
            id: `${Date.now()}-${idx}`,
            description: String(it.description || ""),
            quantity: Number(it.quantity || 0),
            unitPrice: Number(it.unitPrice || 0),
          }))
        }

        const refNo = String(p.referenceNumber || "")
        if (savedKind === "delivery_note" && refNo && loadedItems.length) {
          const sourcePrices = await fetchSourceLinePrices(refNo)
          if (sourcePrices.length) {
            loadedItems = applyDocumentPricesToItems(loadedItems, sourcePrices)
          }
        }
        if (loadedItems.length) setItems(loadedItems)

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
    if (savedInvoiceId) return
    const presetId = searchParams.get("preset")
    if (!presetId) return
    const preset = getDeliveryNotePreset(presetId)
    if (!preset) return

    const today = new Date().toISOString().slice(0, 10)
    setDocumentKind("delivery_note")
    setIssueDate(today)
    setDueDate(today)
    setBillToName(preset.billToName)
    setBillToAddress(preset.billToAddress || "")
    setReferenceNumber(preset.referenceNumber)
    if (preset.fromName) setFromName(preset.fromName)
    if (preset.fromEmail) setFromEmail(preset.fromEmail)
    if (preset.fromPhone) setFromPhone(preset.fromPhone)
    const presetItems = preset.items.map((it, idx) => ({
      id: `preset-${Date.now()}-${idx}`,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice ?? 0,
    }))
    setItems(applyDocumentPricesToItems(presetItems, presetToSourceLinePrices(preset)))
    toast({
      title: "Delivery note loaded",
      description: `${preset.label} — ${preset.items.length} items, dated today.`,
    })
  }, [savedInvoiceId, searchParams, toast])

  useEffect(() => {
    if (documentKind !== "delivery_note") return
    if (!referenceNumber.trim()) return
    if (isLoadingSavedInvoice) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const sourcePrices = await fetchSourceLinePrices(referenceNumber)
      if (cancelled || !sourcePrices.length) return
      setItems((prev) => (prev.length ? applyDocumentPricesToItems(prev, sourcePrices) : prev))
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [referenceNumber, documentKind, isLoadingSavedInvoice])

  const refreshSavedItemCatalog = async () => {
    const cacheKey = "invoice-line-items"
    const cached = readSessionCache<typeof savedItemCatalog>(cacheKey)
    if (cached?.length) {
      setSavedItemCatalog(cached)
      setIsLoadingSavedItems(false)
    } else {
      setIsLoadingSavedItems(true)
    }
    try {
      const res = await fetch("/api/admin/invoices/line-items?scope=all", { cache: "no-store", credentials: "include" })
      const data = await res.json()
      if (res.ok && data?.success && Array.isArray(data.items)) {
        setSavedItemCatalog(data.items)
        writeSessionCache(cacheKey, data.items)
      }
    } catch {
      // ignore — picker stays empty until next load
    } finally {
      setIsLoadingSavedItems(false)
    }
  }

  useEffect(() => {
    refreshSavedItemCatalog()
  }, [])

  useEffect(() => {
    if (savedInvoiceId) return
    try {
      const savedLogo = localStorage.getItem(LOGO_STORAGE_KEY)
      setInvoiceLogo(savedLogo || LOGO_PUBLIC_URL)
      const savedSig = localStorage.getItem(SIGNATURE_STORAGE_KEY)
      if (savedSig) setSignatureImage(savedSig)
      const savedStamp = localStorage.getItem(STAMP_STORAGE_KEY)
      if (savedStamp) setStampImage(savedStamp)
    } catch {
      setInvoiceLogo(LOGO_PUBLIC_URL)
    }
  }, [savedInvoiceId])

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
  const websiteHref = /^https?:\/\//i.test(companyWebsite.trim())
    ? companyWebsite.trim()
    : `https://${websiteDisplay}`
  const docLabels = useMemo(() => documentKindLabels(documentKind), [documentKind])
  const isQuotation = documentKind === "quotation"
  const isDeliveryNote = documentKind === "delivery_note"
  const isInvoice = documentKind === "invoice"
  const effectiveThankYou = thankYouLine.trim() || docLabels.thankYouDefault
  const effectiveTerms = termsText.trim() || docLabels.termsDefault
  const preparedByFooter = `${fromName || "—"} · ${fromEmail || "—"} · ${fromPhone || "—"}`
  const hasProjectTables = Boolean(projectTables?.sections?.length || projectTables?.paymentSchedule?.length)

  const switchDocumentKind = (kind: DocumentKind) => {
    setDocumentKind((prev) => {
      if (prev === kind) return prev
      const fromDefs = DOCUMENT_DEFAULTS[prev]
      const toDefs = DOCUMENT_DEFAULTS[kind]
      setThankYouLine((t) => (t.trim() === fromDefs.thankYou || !t.trim() ? toDefs.thankYou : t))
      setTermsText((t) => (t.trim() === fromDefs.terms || !t.trim() ? toDefs.terms : t))
      return kind
    })
  }
  const getSectionSubtotal = (section: ExtraTableSection): number => {
    return section.rows.reduce((sum, row) => sum + projectRowLineAmount(section, row), 0)
  }
  const projectSubtotal = useMemo(
    () => visibleProjectSections(projectTables?.sections).reduce((sum, section) => sum + getSectionSubtotal(section), 0),
    [projectTables]
  )
  /** Section 0+1 = Electrical + Prototype; section 2 = Service */
  const materialSubtotalForSchedule = useMemo(() => {
    const secs = projectTables?.sections
    if (!secs?.length) return 0
    let total = 0
    if (secs[0] && isProjectSectionVisible(secs[0])) total += getSectionSubtotal(secs[0])
    if (secs[1] && isProjectSectionVisible(secs[1])) total += getSectionSubtotal(secs[1])
    return total
  }, [projectTables])
  const serviceSubtotalForSchedule = useMemo(() => {
    const secs = projectTables?.sections
    if (!secs || secs.length < 3) return 0
    if (!isProjectSectionVisible(secs[2]!)) return 0
    return getSectionSubtotal(secs[2]!)
  }, [projectTables])
  const showPaymentScheduleTable = isPaymentScheduleVisible(projectTables, docLabels.showPaymentSchedule)
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

  const autoFillScheduleDeadlines = useCallback(
    (startIso: string) => {
      if (!hasProjectTables || !isInvoice || !startIso) return
      const deadlines = computeAutoScheduleDeadlines(startIso, PAYMENT_SCHEDULE_PHASE_COUNT)
      if (deadlines.every((d) => !d)) return
      setProjectTables((prev) => {
        if (!prev?.paymentSchedule?.length) return prev
        return {
          ...prev,
          paymentSchedule: prev.paymentSchedule.map((row, idx) => ({
            ...row,
            deadline: deadlines[idx] ?? row.deadline,
          })),
        }
      })
    },
    [hasProjectTables, isInvoice]
  )

  const handleIssueDateChange = (value: string) => {
    setIssueDate(value)
    autoFillScheduleDeadlines(value)
  }

  useEffect(() => {
    if (dashboardScope !== "project") return
    let cancelled = false
    const load = async () => {
      const res = await fetch("/api/admin/invoices?nextReferences=1", { cache: "no-store", credentials: "include" })
      const data = await res.json().catch(() => null)
      if (!cancelled && res.ok && data?.references) nextReferenceCache.current = data.references
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [dashboardScope])

  const chooseProjectCategory = (value: string) => {
    setProjectCategory(value)
    if (documentKind !== "invoice") return
    if (!value) {
      setReferenceNumber((current) => (isAutoCategoryReference(current) ? "" : current))
      return
    }
    const ready = nextReferenceCache.current[value]
    if (ready) setReferenceNumber(ready)
  }

  useEffect(() => {
    if (dashboardScope !== "project" || documentKind !== "invoice" || isLoadingSavedInvoice || isPreviewOnly) return
    if (!projectCategory) {
      if (isAutoCategoryReference(referenceNumber)) setReferenceNumber("")
      return
    }
    if (referenceMatchesCategory(referenceNumber, projectCategory)) return
    let cancelled = false
    const loadReference = async () => {
      const res = await fetch(`/api/admin/invoices?nextReference=${projectCategory}`, { cache: "no-store", credentials: "include" })
      const data = await res.json().catch(() => null)
      if (!cancelled && res.ok && data?.referenceNumber) setReferenceNumber(String(data.referenceNumber))
    }
    void loadReference()
    return () => {
      cancelled = true
    }
    // referenceNumber is read when the category changes; including it would refetch after every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCategory, dashboardScope, documentKind, isLoadingSavedInvoice, isPreviewOnly])

  useEffect(() => {
    if (savedInvoiceId || isLoadingSavedInvoice) return
    if (documentKind === "invoice" && !billToName.trim()) {
      setInvoiceNumber("")
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const clientQs = documentKind === "invoice" ? `&clientName=${encodeURIComponent(billToName.trim())}` : ""
      const res = await fetch(`/api/admin/invoices?nextNumber=${documentKind}${clientQs}`, { cache: "no-store", credentials: "include" })
      const data = await res.json().catch(() => null)
      if (!cancelled && res.ok && data?.invoiceNumber) setInvoiceNumber(String(data.invoiceNumber))
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [documentKind, savedInvoiceId, isLoadingSavedInvoice, billToName])

  useEffect(() => {
    if (savedInvoiceId || isLoadingSavedInvoice || !hasProjectTables || !isInvoice || !issueDate) return
    autoFillScheduleDeadlines(issueDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial fill only; issue date edits use handleIssueDateChange
  }, [savedInvoiceId, isLoadingSavedInvoice, hasProjectTables, isInvoice, autoFillScheduleDeadlines])

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
    setItems((prev) => {
      const remaining = prev.filter((item) => item.id !== id)
      return remaining.length ? remaining : [{ id: `${Date.now()}`, description: "", quantity: 1, unitPrice: 0 }]
    })
  }

  const applySavedItemToLine = (itemId: string, saved: SavedLineItemCatalogEntry) => {
    updateItem(itemId, {
      description: saved.name,
      quantity: saved.quantity,
      unitPrice: saved.unitPrice,
    })
  }

  const applySavedItemToProjectRow = (sectionIndex: number, rowIndex: number, saved: SavedLineItemCatalogEntry) => {
    setProjectTables((prev) => {
      if (!prev?.sections) return prev
      const sections = prev.sections.map((section, sIdx) => {
        if (sIdx !== sectionIndex) return section
        const itemKey = section.columns.find((c) => c.key === "item")?.key || "item"
        const qtyKey = section.columns.find((c) => c.key === "qty")?.key
        const unitKey = section.columns.find((c) => c.key === "unitPrice")?.key
        const rows = section.rows.map((row, rIdx) => {
          if (rIdx !== rowIndex) return row
          let next = { ...row, [itemKey]: saved.name }
          if (qtyKey) next[qtyKey] = String(saved.quantity)
          if (unitKey) next[unitKey] = formatTzMoneyInput(String(saved.unitPrice))
          return recomputeProjectRowLineTotal(section, next)
        })
        return { ...section, rows }
      })
      return { ...prev, sections }
    })
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

  const readAiPhoto = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Use a photo", description: "Drop a JPEG, PNG, or WebP image.", variant: "destructive" })
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Photo is too large", description: "Use a photo under 8 MB.", variant: "destructive" })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const preview = String(reader.result || "")
      const data = preview.split(",")[1] || ""
      if (!data) return
      setAiImage({ mimeType: file.type || "image/jpeg", data, preview })
    }
    reader.readAsDataURL(file)
  }

  const fillInvoiceFromBrief = async () => {
    const brief = aiBrief.trim()
    if ((brief.length < 8 && !aiImage) || isAiFilling) return
    setIsAiFilling(true)
    try {
      const response = await fetch("/api/admin/invoices/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief,
            image: aiImage ? { mimeType: aiImage.mimeType, data: aiImage.data } : null,
            documentKind,
            dashboardScope,
            sections: (projectTables?.sections || []).map((section) => section.title),
          }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not prepare the invoice")
      const draft = data?.draft as {
        clientName?: string
        clientAddress?: string
        clientEmail?: string
        clientPhone?: string
        reference?: string
        notes?: string
        lines?: Array<{ section?: string; item?: string; qty?: string; unitPrice?: string }>
      }
      const lines = Array.isArray(draft?.lines) ? draft.lines : []
      setBillToName(draft?.clientName || "")
      setBillToAddress(draft?.clientAddress || "")
      setBillToEmail(draft?.clientEmail || "")
      setBillToPhone(draft?.clientPhone || "")
      if (draft?.notes) setTermsText(draft.notes)

      if (hasProjectTables) {
        setProjectTables((prev) => {
          if (!prev?.sections) return prev
          const sections = prev.sections.map((section) => {
            const matched = lines.filter((line) => lineBelongsToSection(String(line.section || ""), section.title) && String(line.item || "").trim())
            if (!matched.length) return section
            const rows = matched.map((line, index) => {
              const row: Record<string, string> = {}
              section.columns.forEach((col) => {
                row[col.key] = ""
              })
              if ("sn" in row || section.columns.some((col) => col.key === "sn")) row.sn = String(index + 1)
              const itemKey = section.columns.find((col) => col.key === "item")?.key || "item"
              row[itemKey] = String(line.item || "").trim()
              if (section.columns.some((col) => col.key === "qty")) row.qty = String(line.qty || "1")
              if (section.columns.some((col) => col.key === "unitPrice")) {
                row.unitPrice = line.unitPrice ? formatTzMoneyInput(String(line.unitPrice)) : ""
              }
              return recomputeProjectRowLineTotal(section, row)
            })
            return { ...section, rows }
          })
          return { ...prev, sections }
        })
      } else if (lines.length) {
        setItems(
          lines.map((line, index) => ({
            id: `ai-${Date.now()}-${index}`,
            description: String(line.item || "").trim(),
            quantity: parseQtyInput(String(line.qty || "1")) || 1,
            unitPrice: parseMoneyInput(String(line.unitPrice || "0")),
          }))
        )
      }

      const filled = lines.filter((line) => String(line.item || "").trim()).length
      const summary = data?.summary as { storePriced?: number; invoicePriced?: number; unpriced?: number; clientFromHistory?: boolean } | undefined
      const priced = (summary?.storePriced || 0) + (summary?.invoicePriced || 0)
      const priceNote = summary
        ? `${priced} priced from the store or past invoices${summary.unpriced ? `, ${summary.unpriced} left blank` : ""}${summary.clientFromHistory ? ". Client details came from a saved invoice" : ""}.`
        : "Check prices before you save."
      toast({
        title: "Invoice draft filled",
        description: filled ? `${filled} line${filled === 1 ? "" : "s"}. ${priceNote}` : "Client details were written. Add the item lines on the invoice.",
      })
    } catch (error) {
      toast({
        title: "Could not fill the invoice",
        description: error instanceof Error ? error.message : "Gemini did not return a draft.",
        variant: "destructive",
      })
    } finally {
      setIsAiFilling(false)
    }
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
        const hasSn = section.columns.some((c) => isSerialColumnKey(c.key))
        const remaining = section.rows.filter((_, idx) => idx !== rowIndex)
        const rows = (remaining.length ? remaining : [Object.fromEntries(section.columns.map((col) => [col.key, ""]))]).map((row, idx) => {
          const next = hasSn ? { ...row, sn: String(idx + 1) } : row
          return recomputeProjectRowLineTotal(section, next)
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

  const toggleProjectSectionVisibility = (sectionIndex: number, visible: boolean) => {
    setProjectTables((prev) => {
      if (!prev?.sections) return prev
      const sections = prev.sections.map((section, sIdx) =>
        sIdx === sectionIndex ? { ...section, hidden: visible ? undefined : true } : section
      )
      return { ...prev, sections }
    })
  }

  const togglePaymentScheduleVisibility = (visible: boolean) => {
    setProjectTables((prev) => (prev ? { ...prev, hidePaymentSchedule: visible ? undefined : true } : prev))
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
    setInvoiceLogo(LOGO_PUBLIC_URL)
    try {
      localStorage.setItem(LOGO_STORAGE_KEY, LOGO_PUBLIC_URL)
    } catch {
      // ignore
    }
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
        const rowBg =
          index % 2 === 1
            ? `background-color:${rowStripe} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;`
            : `background-color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;`
        if (isDeliveryNote) {
          const rowTotal = item.quantity * item.unitPrice
          return `
          <tr style="${rowBg}">
            <td style="font-size:12px;text-align:center;color:#111;">${index + 1}</td>
            <td style="font-size:12px;color:#111;">${escapeHtml(item.description || "—")}</td>
            <td style="font-size:12px;text-align:right;color:#111;">${item.quantity}</td>
            <td style="font-size:12px;text-align:right;color:#111;">${money(item.unitPrice)}</td>
            <td style="font-size:12px;text-align:right;font-weight:600;color:#111;">${money(rowTotal)}</td>
            <td style="font-size:12px;text-align:center;color:#111;">${markCellHtml()}</td>
          </tr>
        `
        }
        const rowTotal = item.quantity * item.unitPrice
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
      ? `<img src="${invoiceLogo}" alt="" style="height:72px;max-width:128px;object-fit:contain;display:block;" />`
      : `<div style="height:72px;width:72px;border-radius:50%;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:9px;color:#9ca3af;">Logo</div>`

    const addressForPdf = String(billToAddress || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false
        // Avoid duplicating phone/email when those fields are shown separately
        if (/^(tel|phone|email)\b/i.test(line)) return false
        if (billToEmail && line.toLowerCase().includes(billToEmail.toLowerCase())) return false
        if (billToPhone && line.replace(/\s/g, "").includes(billToPhone.replace(/\s/g, ""))) return false
        return true
      })
      .join("\n")
    const billContact = [
      addressForPdf
        ? `<p style="margin:2px 0;font-size:12px;line-height:1.5;color:#6b7280;white-space:pre-line;">${escapeHtml(addressForPdf)}</p>`
        : "",
      billToEmail ? `<p style="margin:2px 0;font-size:12px;color:#6b7280;">${escapeHtml(billToEmail)}</p>` : "",
      billToPhone ? `<p style="margin:2px 0;font-size:12px;color:#6b7280;">${escapeHtml(billToPhone)}</p>` : "",
    ]
      .filter(Boolean)
      .join("")

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

    const extraSectionsHtml = visibleProjectSections(projectTables?.sections)
      .map((section) => {
        const isPrototype = isPrototypeSectionTitle(section.title)
        const displayCols = isDeliveryNote ? deliveryNoteColumns(section.columns) : section.columns
        const cols = displayCols
          .map(
            (col) =>
              `<th class="${
                col.align === "right" ? "r" : col.align === "center" ? "c" : ""
              }" style="width:${columnWidthForKey(col.key)};">${escapeHtml(columnHeaderLabel(col, currency))}</th>`
          )
          .join("")
        const colgroup = `<colgroup>${displayCols
          .map((col) => `<col style="width:${columnWidthForKey(col.key)};" />`)
          .join("")}</colgroup>`
        const rowsHtml = section.rows
          .map((row, rowIndex) => {
            const cells = displayCols
              .map((col) => {
                if (col.key === "mark") {
                  return `<td class="c">${markCellHtml()}</td>`
                }
                const value = displayProjectTableCell(row, col, rowIndex, currency, section)
                const klass = col.align === "right" ? "r" : col.align === "center" ? "c" : ""
                const rowRed = isPrototype && isPrototypeRowHighlighted(row)
                return `<td class="${klass}" style="${rowRed ? "color:#b91c1c;" : ""}">${escapeHtml(value)}</td>`
              })
              .join("")
            return `<tr style="${rowIndex % 2 === 1 ? `background-color:${rowStripe} !important;` : ""}">${cells}</tr>`
          })
          .join("")
        const subtotalRow = `<tr><td colspan="${Math.max(1, displayCols.length - 1)}" style="text-align:right;font-weight:800;">SUBTOTAL</td><td class="r" style="font-weight:800;">${money(getSectionSubtotal(section))}</td></tr>`
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

    const gtPdf = Math.max(0, Math.round(effectiveGrandTotal))
    const svcPdf = Math.max(0, Math.round(serviceSubtotalForSchedule))
    const svcAppliedPdf = Math.min(svcPdf, gtPdf)
    const matRemPdf = Math.max(0, gtPdf - svcAppliedPdf)
    const payAmtPdf = [
      Math.floor(matRemPdf / 2),
      matRemPdf - Math.floor(matRemPdf / 2),
      Math.floor(svcAppliedPdf / 2),
      svcAppliedPdf - Math.floor(svcAppliedPdf / 2),
    ]
    const schedRawPdf = projectTables?.paymentSchedule || []
    const paymentScheduleHtml = showPaymentScheduleTable
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
      <div class="pay" style="margin-top:22px;break-inside:avoid;page-break-inside:avoid;">
        <div class="pay-wrap" style="break-inside:avoid;page-break-inside:avoid;">
          <div class="pay-head">Payment method</div>
          <div class="pay-box" style="break-inside:avoid;page-break-inside:avoid;">
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
    const quoteScopeHtml =
      isQuotation && quotationScope.trim()
        ? `<p class="quote-scope">${escapeHtml(quotationScope.trim())}</p>`
        : ""
    const quotePreparedFooterHtml = isQuotation
      ? `<p class="quote-prepared-footer">${escapeHtml(docLabels.preparedByLabel)} ${escapeHtml(preparedByFooter)}</p>`
      : ""
    const quoteAcceptHtml = isQuotation
      ? `<div class="quote-accept">
          <p class="quote-accept-title">${escapeHtml(docLabels.acceptanceHeading)}</p>
          <p class="quote-accept-lbl">Signature</p>
          <div class="quote-accept-line"></div>
        </div>`
      : ""
    const invoiceClientAcceptHtml =
      !isQuotation && !isDeliveryNote && showClientApproval
        ? `<div class="client-approve">
            <p class="client-approve-title">${escapeHtml(docLabels.acceptanceHeading)}</p>
            <div class="client-approve-grid">
              <div>
                <p class="quote-accept-lbl">Client name / authorised person</p>
                <div class="quote-accept-line"></div>
              </div>
              <div>
                <p class="quote-accept-lbl">Date</p>
                <div class="quote-accept-line"></div>
              </div>
              <div>
                <p class="quote-accept-lbl">Signature</p>
                <div class="quote-accept-line" style="min-height:36px;"></div>
              </div>
              <div>
                <p class="quote-accept-lbl">Company stamp</p>
                <div class="quote-accept-line" style="min-height:56px;"></div>
              </div>
            </div>
          </div>`
        : ""
    const deliveryReceiptHtml = isDeliveryNote
      ? `<div class="quote-accept">
          <p class="quote-accept-title">${escapeHtml(docLabels.acceptanceHeading)}</p>
          <p class="quote-accept-lbl">Received by (print name)</p>
          <div class="quote-accept-line"></div>
          <p class="quote-accept-lbl" style="margin-top:12px;">Signature</p>
          <div class="quote-accept-line"></div>
          <p class="quote-accept-lbl" style="margin-top:12px;">Date received</p>
          <div class="quote-accept-line"></div>
          <p class="quote-accept-lbl" style="margin-top:12px;">Comments (missing / damaged items)</p>
          <div class="quote-accept-line" style="min-height:48px;"></div>
        </div>`
      : ""
    const referenceHtml =
      docLabels.referenceLabel && referenceNumber.trim()
        ? `<p class="inv-date" style="margin-top:4px;">${escapeHtml(docLabels.referenceLabel)} ${escapeHtml(referenceNumber.trim())}</p>`
        : ""
    const backorderedHtml =
      isDeliveryNote && backorderedNote.trim()
        ? `<div class="extra-block" style="margin-top:12px;">
            <p class="extra-title">Missing / backordered items</p>
            <p style="margin:0;font-size:12px;white-space:pre-line;color:#374151;">${escapeHtml(backorderedNote.trim())}</p>
          </div>`
        : ""
    const quoteSubtitleHtml = (isQuotation || isDeliveryNote) && docLabels.subtitle
      ? `<div class="quote-sub">${escapeHtml(docLabels.subtitle)}</div>`
      : ""
    const itemsTableTitleHtml = itemsTableTitle.trim()
      ? `<p class="items-table-title">${escapeHtml(itemsTableTitle.trim())}</p>`
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
            .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
            .brand { display: flex; align-items: center; gap: 14px; max-width: 58%; }
            .co { font-size: 18px; font-weight: 800; color: #111; letter-spacing: -0.02em; }
            .tag { font-size: 10px; font-weight: 800; color: #374151; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px; }
            .co-addr { margin-top: 8px; padding-left: 8px; border-left: 2px solid #e2e8f0; font-size: 10px; line-height: 1.55; color: #64748b; white-space: pre-line; }
            .doc-title-wrap { text-align: right; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; }
            .inv-title { font-size: 36px; font-weight: 800; color: ${blue}; letter-spacing: 0.04em; line-height: 1; }
            .url-row { text-align: right; font-size: 9px; font-weight: 600; margin: 10px 0 4px; letter-spacing: 0.02em; }
            .url-row a { color: #475569; text-decoration: none; }
            .line-wrap { margin-top: 0; }
            .line-rule { position: relative; min-height: 1px; }
            /* border-top prints reliably; thin background divs often disappear in “Save as PDF” */
            .line-bg { width: 100%; height: 0; margin: 0; padding: 0; border: 0; border-top: 1px solid #d1d5db; }
            .line-accent { position: absolute; left: 0; top: 0; width: 96px; height: 0; border: 0; border-top: 3px solid ${blue}; }
            .items-table-title { margin: 16px 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #0f172a; }
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
            .pay {
              margin-top: 18px;
              max-width: 360px;
              text-align: left;
              break-inside: avoid;
              page-break-inside: avoid;
              -webkit-column-break-inside: avoid;
            }
            .pay-wrap {
              border: none;
              background: transparent;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .pay-head { background: transparent; color: #111827; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding: 0 0 8px; margin: 0 0 8px; border: none; border-bottom: 1px solid #e5e7eb; }
            .pay-box {
              background: transparent;
              padding: 4px 0 0 12px;
              border: none;
              border-left: 4px solid ${blue} !important;
              -webkit-print-color-adjust: exact;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .pay-method {
              break-inside: avoid;
              page-break-inside: avoid;
            }
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
            .foot {
              margin-top: 28px;
              display: flex;
              justify-content: space-between;
              gap: 24px;
              flex-wrap: wrap;
              align-items: flex-end;
              break-inside: avoid;
              page-break-inside: avoid;
            }
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
            .icons { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 12px; font-size: 12px; color: #4b5563; }
            .ic { display: flex; align-items: center; gap: 8px; max-width: 34%; }
            .ic-addr { align-items: flex-start; }
            .ic-box {
              display: inline-flex; align-items: center; justify-content: center;
              width: 28px; height: 28px; flex-shrink: 0;
              border: 2px solid ${blue}; border-radius: 4px; color: ${blue};
            }
            .ic-box svg { display: block; width: 14px; height: 14px; }
            .ic-text { line-height: 1.4; word-break: break-word; }
            .quote-sub { font-size: 9px; font-weight: 700; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 5px; text-align: right; }
            .quote-scope { font-size: 12px; color: #475569; margin: 6px 0 0; line-height: 1.45; }
            .quote-prepared-footer { margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #64748b; text-align: center; line-height: 1.45; }
            .quote-accept { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1; text-align: right; }
            .quote-accept-title { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; margin: 0 0 8px; }
            .quote-accept-line { border-bottom: 1px solid #94a3b8; height: 22px; margin: 8px 0 4px; }
            .quote-accept-lbl { font-size: 10px; color: #64748b; margin: 0; text-align: right; }
            .client-approve {
              margin-top: 20px;
              padding-top: 12px;
              border-top: 1px solid #e2e8f0;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .client-approve-title {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0 0 12px;
            }
            .client-approve-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 14px 24px;
            }
            .client-approve-grid .quote-accept-lbl { text-align: left; }
            .client-approve-grid .quote-accept-line { margin: 6px 0 0; }
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
                  ${fromAddress.trim() ? `<div class="co-addr">${escapeHtml(fromAddress.trim())}</div>` : ""}
                </div>
              </div>
              <div style="text-align:right;" class="doc-title-wrap">
                <div class="inv-title">${escapeHtml(docLabels.title)}</div>
                ${quoteSubtitleHtml}
              </div>
            </div>
            <div class="url-row"><a href="${escapeHtml(websiteHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteDisplay)}</a></div>
            <div class="line-wrap">
              <div class="line-rule">
                <div class="line-bg"></div>
                <div class="line-accent"></div>
              </div>
            </div>
            <div class="meta">
              <div>
                <p class="to-label">${escapeHtml(docLabels.billToLabel)}</p>
                <p class="to-name">${escapeHtml(billToName || "Client name")}</p>
                ${quoteScopeHtml}
                ${billContact}
              </div>
              <div class="inv-meta">
                <p class="inv-no">${escapeHtml(docLabels.numberLabel)} ${escapeHtml(invoiceNumber)}</p>
                ${isDeliveryNote ? "" : referenceHtml}
                <p class="inv-date">${escapeHtml(docLabels.issueDateLabel)} ${escapeHtml(formatLongDate(issueDate))}</p>
                <p class="inv-date" style="color:#6b7280;margin-top:4px;">${escapeHtml(docLabels.dueLabel)} ${escapeHtml(formatLongDate(dueDate))}</p>
                ${isDeliveryNote ? referenceHtml : ""}
              </div>
            </div>
            ${
              hasProjectTables
                ? ""
                : isDeliveryNote
                  ? `${itemsTableTitleHtml}<table style="table-layout:fixed;">
              <colgroup>
                <col style="width:${columnWidthForKey("sn")};" />
                <col style="width:${columnWidthForKey("item")};" />
                <col style="width:${columnWidthForKey("qty")};" />
                <col style="width:${columnWidthForKey("unitPrice")};" />
                <col style="width:${columnWidthForKey("totalPrice")};" />
                <col style="width:${columnWidthForKey("mark")};" />
              </colgroup>
              <thead>
                <tr>
                  <th class="c">NO</th>
                  <th>ITEM / DESCRIPTION</th>
                  <th class="r">QTY</th>
                  <th class="r">PRICE (${escapeHtml(currency)})</th>
                  <th class="r">TOTAL (${escapeHtml(currency)})</th>
                  <th class="c">MARK</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
                  : `${itemsTableTitleHtml}<table style="table-layout:fixed;">
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
            ${backorderedHtml}
            ${
              docLabels.showTotals
                ? `<div class="totals">
              <div class="sum">
                <div class="sumline"><span>Sub Total :</span><span>${currency} ${money(effectiveSubtotal)}</span></div>
                <div class="sumline"><span>Tax ${taxRate}% :</span><span>${currency} ${money(effectiveTaxAmount)}</span></div>
                ${discountRow}
                <div class="grand"><span>${escapeHtml(docLabels.grandTotalLabel)}</span><span>${currency} ${money(effectiveGrandTotal)}</span></div>
              </div>
            </div>`
                : ""
            }
            ${showPaymentScheduleTable ? paymentScheduleHtml : ""}
            ${docLabels.showPaymentMethods ? paymentMethodHtml : ""}
            <div class="foot">
              <div class="terms">
                <p style="margin:0 0 8px;font-weight:800;color:#111;">${escapeHtml(effectiveThankYou)}</p>
                <h4>${escapeHtml(docLabels.termsHeading)}</h4>
                <p style="margin:0;white-space:pre-line;">${convertInlineBoldToHtml(effectiveTerms || "—")}</p>
              </div>
              <div class="sign">
                ${isDeliveryNote ? `<p class="sign-name" style="font-size:11px;">Dispatched by: ${escapeHtml(signerName)}</p>` : `<p class="sign-name">${escapeHtml(signerName)}</p>`}
                ${isDeliveryNote ? "" : `<p class="sign-t">${escapeHtml(signerTitle)}</p>`}
                ${isDeliveryNote ? "" : signBoldSignatureHtml}
                ${stampBelowSignatureHtml}
                ${quoteAcceptHtml}
                ${deliveryReceiptHtml}
              </div>
            </div>
            ${invoiceClientAcceptHtml}
            <div class="bar">
              <div class="line-bg"></div>
              <div class="line-accent"></div>
            </div>
            <div class="icons">
              <div class="ic">
                <span class="ic-box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </span>
                <span class="ic-text">${escapeHtml(footerPhone)}</span>
              </div>
              <div class="ic">
                <span class="ic-box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </span>
                <span class="ic-text">${escapeHtml(footerEmail)}</span>
              </div>
              <div class="ic ic-addr">
                <span class="ic-box" aria-hidden="true" style="margin-top:2px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <span class="ic-text">${escapeHtml(footerAddress)}</span>
              </div>
            </div>
            ${quotePreparedFooterHtml}
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
        description: `Please fill ${
          isQuotation ? "Quotation for" : documentKind === "delivery_note" ? "Delivery to" : "Invoice to"
        } (client name) before saving.`,
        variant: "destructive",
      })
      }
      return
    }

    const hasMissingPaymentRequired =
      isInvoice &&
      paymentMethods.some(
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
      fromAddress,
      companyWebsite,
      companyTagline,
      signerName,
      signerTitle,
      footerPhone,
      footerEmail,
      footerAddress,
      thankYouLine,
      termsText,
      quotationScope,
      itemsTableTitle,
      referenceNumber,
      linkedTechnicalReport: !isDeliveryNote && !isQuotation ? referenceNumber.trim() : undefined,
      backorderedNote,
      showClientApproval,
      projectCategory: dashboardScope === "project" ? projectCategory : undefined,
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
      if (data?.invoice?.payload?.referenceNumber) {
        const savedReference = String(data.invoice.payload.referenceNumber)
        setReferenceNumber(savedReference)
        if (projectCategory && nextReferenceCache.current[projectCategory] === savedReference) {
          const match = savedReference.match(/^(.*-)(\d+)$/)
          if (match) nextReferenceCache.current[projectCategory] = `${match[1]}${String(Number(match[2]) + 1).padStart(4, "0")}`
        }
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
          title: isDeliveryNote ? "Delivery note saved" : "Invoice saved",
          description: `${String(data?.invoice?.invoice_number || invoiceNumber)} saved for ${billToName.trim()}.`,
        })
      }
      void refreshSavedItemCatalog()
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

  const docNav = [
    { kind: "invoice" as const, label: "Invoice" },
    { kind: "quotation" as const, label: "Quotation" },
    { kind: "delivery_note" as const, label: "Delivery Note" },
  ]
  const savedDocumentsLabel = documentKind === "delivery_note" ? "View Saved Notes" : documentKind === "quotation" ? "View Saved Quotations" : "View Saved Invoices"

  return (
    <div className={cn(themeClasses.mainText)}>
      <style>{`@media print { .sheet-field { background: transparent !important; border: 0 !important; box-shadow: none !important; outline: none !important; } .sheet-only-screen, .invoice-tools { display: none !important; } }`}</style>
      <div className={cn("mx-auto w-full max-w-[1180px]", isPreviewOnly && "max-w-[860px]")}>
      {!isPreviewOnly ? (
        <div className="invoice-tools mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invoice Studio</h1>
            <p className="mt-1 text-sm text-slate-500">Blue header style, zebra rows, payment block — matches classic agency invoices.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {!lockDocumentKind ? (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {docNav.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => switchDocumentKind(item.kind)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm",
                      documentKind === item.kind ? "bg-[#184a96] font-semibold text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link href={savedListHref} className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                {savedDocumentsLabel}
              </Link>
              <button
                type="button"
                onClick={() => saveInvoiceToDatabase()}
                disabled={isSavingInvoice}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {isSavingInvoice ? "Saving..." : docLabels.saveButtonLabel}
              </button>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                <Printer className="h-4 w-4" />
                Print
              </button>
              <button type="button" onClick={downloadAsPdf} className="inline-flex items-center gap-2 rounded-md bg-[#184a96] px-3 py-2 text-sm font-semibold text-white hover:bg-[#123a78]">
                <FileDown className="h-4 w-4" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="invoice-tools mb-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            onClick={() => {
              if (dashboardScope === "project") {
                router.push(previousProjectPage(`${pathname || ""}${window.location.search}`))
                return
              }
              router.push(backToSavedInvoice)
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      )}
      <div className={cn("flex w-full flex-col gap-8 lg:flex-row lg:items-start")}>
        {!isPreviewOnly ? (
          <aside className="invoice-tools w-full shrink-0 lg:sticky lg:top-6 lg:w-[240px]">
            {dashboardScope === "project" ? (
              <div>
                <p className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#184a96]">Project type</p>
                <select
                  value={projectCategory}
                  onChange={(event) => chooseProjectCategory(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                >
                  <option value="">Not set</option>
                  <option value="fyp">FYP projects</option>
                  <option value="side">Side projects</option>
                  <option value="research">Researches</option>
                </select>
              </div>
            ) : null}

            <div className={cn(dashboardScope === "project" && "mt-8")}>
              <p className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#184a96]">Gemini</p>
              <Textarea
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                rows={5}
                placeholder="Example: Niandikie invoice ya buck converter, 10 res, 10 cap, na wire mita 10."
                className="resize-y border-slate-200 bg-white text-sm"
              />
              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setAiDragOver(true)
                }}
                onDragLeave={() => setAiDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setAiDragOver(false)
                  const file = event.dataTransfer.files?.[0]
                  if (file) readAiPhoto(file)
                }}
                className={cn("mt-2 rounded-md border border-dashed px-2.5 py-3 text-center", aiDragOver ? "border-[#184a96] bg-blue-50" : "border-slate-300 bg-white")}
              >
                {aiImage ? (
                  <div className="space-y-2">
                    <img src={aiImage.preview} alt="" className="mx-auto h-20 w-full rounded object-cover" />
                    <button type="button" className="text-xs font-semibold text-slate-500" onClick={() => setAiImage(null)}>Remove photo</button>
                  </div>
                ) : (
                  <label className="block cursor-pointer text-xs text-slate-500">
                    Drop a photo of the list or the parts
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) readAiPhoto(file)
                        event.target.value = ""
                      }}
                    />
                  </label>
                )}
              </div>
              <button
                type="button"
                onClick={fillInvoiceFromBrief}
                disabled={isAiFilling || (aiBrief.trim().length < 8 && !aiImage)}
                className="mt-2 flex w-full items-center gap-2 rounded-md bg-[#184a96] px-2.5 py-2 text-left text-sm font-semibold text-white disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {isAiFilling ? "Writing..." : "Fill invoice"}
              </button>
            </div>

          </aside>
        ) : null}

        <div key={savedInvoiceId || "new-invoice"} className="min-w-0 flex-1">
            <div
              className="relative mx-auto w-full max-w-[860px] overflow-hidden border text-slate-900"
              style={{
                background: "#fff",
                borderColor: "rgba(15, 23, 42, 0.22)",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05), 0 3px 10px rgba(15, 23, 42, 0.07)",
              }}
            >
              <div className="relative z-10">
              {/* Header — logo and INVOICE both vertically centered with brand block */}
              <div className="flex flex-col justify-between gap-4 px-6 pb-0 pt-6 sm:flex-row sm:items-center">
                <div className="flex max-w-[58%] items-center gap-3 sm:gap-4">
                  <div className="shrink-0">
                    {invoiceLogo ? (
                      <img
                        src={invoiceLogo}
                        alt=""
                        className="h-[72px] w-auto max-w-[128px] object-contain"
                      />
                    ) : (
                      <div
                        className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-dashed text-[10px] text-slate-400"
                        style={{ borderColor: "#cbd5e1" }}
                      >
                        Logo
                      </div>
                    )}
                    {!isPreviewOnly ? (
                      <div className="sheet-only-screen mt-1 flex gap-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoUpload}
                        />
                        <button type="button" className="text-[10px] font-semibold text-[#184a96]" onClick={() => logoInputRef.current?.click()}>
                          {invoiceLogo ? "Change logo" : "Upload logo"}
                        </button>
                        {invoiceLogo ? (
                          <button type="button" className="text-[10px] font-semibold text-slate-500" onClick={clearLogo}>
                            Clear
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetField
                      editable={!isPreviewOnly}
                      value={fromName}
                      onChange={setFromName}
                      placeholder="Your company"
                      className="text-lg font-extrabold leading-tight tracking-tight text-slate-900"
                    />
                    <SheetField
                      editable={!isPreviewOnly}
                      value={companyTagline}
                      onChange={setCompanyTagline}
                      placeholder="Tagline"
                      className="mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-700"
                    />
                    {!isPreviewOnly || fromAddress.trim() ? (
                      <div className="mt-2 border-l-2 border-slate-200 pl-2.5">
                        <SheetField
                          editable={!isPreviewOnly}
                          value={fromAddress}
                          onChange={setFromAddress}
                          multiline
                          placeholder="Office address"
                          className="text-[10px] leading-[1.55] text-slate-500"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center text-right">
                  <div
                    className={cn(
                      "font-extrabold tracking-wide",
                      isQuotation ? "text-3xl sm:text-4xl" : "text-4xl"
                    )}
                    style={{ color: INV.blue }}
                  >
                    {docLabels.title}
                  </div>
                  {isQuotation && docLabels.subtitle ? (
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{docLabels.subtitle}</p>
                  ) : null}
                  {isDeliveryNote && docLabels.subtitle ? (
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{docLabels.subtitle}</p>
                  ) : null}
                </div>
              </div>

              {/* Website sits on the divider line (not under INVOICE title) */}
              <div className="relative mt-2.5 px-6">
                <div className="pb-1 text-right text-[9px] font-semibold normal-case leading-none tracking-normal text-slate-600 sm:text-[10px]">
                  {isPreviewOnly ? (
                    <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {websiteDisplay}
                    </a>
                  ) : (
                    <SheetField
                      editable
                      value={companyWebsite}
                      onChange={setCompanyWebsite}
                      placeholder="website"
                      className="text-right text-[9px] font-semibold text-slate-600 sm:text-[10px]"
                    />
                  )}
                </div>
                <div className="h-px w-full" style={{ background: INV.lineGray }} />
                <div className="absolute bottom-0 left-6 h-[3px] w-24" style={{ background: INV.blue }} />
              </div>

              {/* Invoice to + meta */}
              <div className="mt-4 grid grid-cols-1 gap-6 px-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-slate-900">{docLabels.billToLabel}</p>
                  <SheetField
                    editable={!isPreviewOnly}
                    value={billToName}
                    onChange={setBillToName}
                    placeholder="Client name"
                    className="mt-1 text-[15px] font-extrabold text-slate-900"
                  />
                  {isQuotation && (!isPreviewOnly || quotationScope.trim()) ? (
                    <SheetField
                      editable={!isPreviewOnly}
                      value={quotationScope}
                      onChange={setQuotationScope}
                      multiline
                      placeholder="What this quotation covers"
                      className="mt-1.5 text-xs leading-relaxed text-slate-600"
                    />
                  ) : null}
                  {!isPreviewOnly || billToAddress.trim() ? (
                    <SheetField
                      editable={!isPreviewOnly}
                      value={billToAddress}
                      onChange={setBillToAddress}
                      multiline
                      placeholder="Client address"
                      className="mt-0.5 text-xs text-slate-500"
                    />
                  ) : null}
                  {!isPreviewOnly || billToEmail.trim() ? (
                    <SheetField
                      editable={!isPreviewOnly}
                      value={billToEmail}
                      onChange={setBillToEmail}
                      placeholder="Client email"
                      className="text-xs text-slate-500"
                    />
                  ) : null}
                  {!isPreviewOnly || billToPhone.trim() ? (
                    <SheetField
                      editable={!isPreviewOnly}
                      value={billToPhone}
                      onChange={setBillToPhone}
                      placeholder="Client phone"
                      className="mt-0.5 text-xs text-slate-500"
                    />
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="flex flex-wrap items-baseline justify-end gap-1 text-sm font-extrabold text-slate-900">
                    <span>{docLabels.numberLabel}</span>
                    <span>{invoiceNumber || "—"}</span>
                  </p>
                  {!isDeliveryNote && docLabels.referenceLabel && (!isPreviewOnly || referenceNumber.trim()) ? (
                    <p className="mt-0.5 flex flex-wrap items-baseline justify-end gap-1 text-sm font-semibold text-slate-900">
                      <span>{docLabels.referenceLabel}</span>
                      <span>{referenceNumber || "—"}</span>
                    </p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center justify-end gap-1 text-sm text-slate-900">
                    <span>{docLabels.issueDateLabel}</span>
                    {isPreviewOnly ? (
                      formatLongDate(issueDate)
                    ) : (
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(e) => handleIssueDateChange(e.target.value)}
                        className="sheet-field border-0 bg-transparent text-right text-sm text-slate-900 outline-none focus:bg-sky-50"
                      />
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center justify-end gap-1 text-xs text-slate-500">
                    <span>{docLabels.dueLabel}</span>
                    {isPreviewOnly ? (
                      formatLongDate(dueDate)
                    ) : (
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="sheet-field border-0 bg-transparent text-right text-xs text-slate-500 outline-none focus:bg-sky-50"
                      />
                    )}
                  </p>
                  {isDeliveryNote && referenceNumber.trim() ? (
                    <p className="mt-0.5 text-xs text-slate-500">{docLabels.referenceLabel} {referenceNumber.trim()}</p>
                  ) : null}
                </div>
              </div>

              {!hasProjectTables ? (
                <div className="mt-5 px-6">
                  {!isPreviewOnly || itemsTableTitle.trim() ? (
                    <SheetField
                      editable={!isPreviewOnly}
                      value={itemsTableTitle}
                      onChange={setItemsTableTitle}
                      placeholder="Table heading"
                      className="mb-2 text-[11px] font-extrabold uppercase leading-relaxed tracking-[0.06em] text-slate-900"
                    />
                  ) : null}
                <div className="overflow-x-auto border border-slate-300">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: columnWidthForKey("sn") }} />
                      <col style={{ width: columnWidthForKey("item") }} />
                      <col style={{ width: columnWidthForKey("qty") }} />
                      <col style={{ width: columnWidthForKey("unitPrice") }} />
                      <col style={{ width: columnWidthForKey("totalPrice") }} />
                      {docLabels.showMarkColumn ? <col style={{ width: columnWidthForKey("mark") }} /> : null}
                    </colgroup>
                    <thead>
                      <tr style={{ background: INV.blue }}>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          NO
                        </th>
                        <th className="border border-blue-700 px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                          {isDeliveryNote ? "ITEM / DESCRIPTION" : "DESCRIPTION"}
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
                        {docLabels.showMarkColumn ? (
                          <th className="border border-blue-700 px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:px-3.5">
                            MARK
                          </th>
                        ) : null}
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
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <SheetField
                                    editable={!isPreviewOnly}
                                    value={item.description}
                                    onChange={(value) => updateItem(item.id, { description: value })}
                                    placeholder="Description"
                                    className="text-sm font-medium text-slate-900"
                                  />
                                </div>
                                {!isPreviewOnly ? (
                                  <button
                                    type="button"
                                    className="sheet-only-screen shrink-0 text-[10px] font-semibold text-red-600"
                                    onClick={() => removeItem(item.id)}
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-right text-sm text-slate-700 sm:px-3.5">
                              {isPreviewOnly ? (
                                item.quantity
                              ) : (
                                <input
                                  value={String(item.quantity)}
                                  inputMode="decimal"
                                  onChange={(e) => updateItem(item.id, { quantity: parseQtyInput(e.target.value) })}
                                  className="sheet-field w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none focus:bg-sky-50"
                                />
                              )}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-right text-sm tabular-nums text-slate-700 sm:px-3.5">
                              {isPreviewOnly ? (
                                money(item.unitPrice)
                              ) : (
                                <input
                                  value={item.unitPrice ? String(item.unitPrice) : ""}
                                  inputMode="decimal"
                                  placeholder="0"
                                  onChange={(e) => updateItem(item.id, { unitPrice: parseMoneyInput(e.target.value) })}
                                  className="sheet-field w-full border-0 bg-transparent text-right text-sm tabular-nums text-slate-700 outline-none focus:bg-sky-50"
                                />
                              )}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900 sm:px-3.5">
                              {money(rowTotal)}
                            </td>
                            {docLabels.showMarkColumn ? (
                              <td className="border border-slate-200 px-2.5 py-2.5 text-center sm:px-3.5">
                                <span
                                  className="inline-flex h-3.5 w-3.5 border border-slate-600"
                                  aria-hidden
                                />
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {!isPreviewOnly ? (
                  <button type="button" className="sheet-only-screen mt-2 text-xs font-semibold text-[#184a96]" onClick={addItem}>
                    Add line
                  </button>
                ) : null}
                </div>
              ) : null}

              {(projectTables?.sections || []).map((section, sectionIndex) => {
                const sectionVisible = isProjectSectionVisible(section)
                if (!sectionVisible && isPreviewOnly) return null
                const prototypeSection = isPrototypeSectionTitle(section.title)
                const previewCols = isDeliveryNote ? deliveryNoteColumns(section.columns) : section.columns
                return (
                <div key={section.title} className="mt-2 px-6">
                  {!isPreviewOnly ? (
                    <label className="sheet-only-screen mb-1.5 flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={sectionVisible}
                        onChange={(event) => toggleProjectSectionVisibility(sectionIndex, event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      Use {section.title}
                    </label>
                  ) : null}
                  {sectionVisible ? (
                  <>
                  <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-900">{section.title}</p>
                  <div className="overflow-x-auto border border-slate-300">
                    <table className="min-w-full table-fixed border-collapse">
                      <colgroup>
                        {previewCols.map((col) => (
                          <col key={`${section.title}-${col.key}-w`} style={{ width: columnWidthForKey(col.key) }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr style={{ background: INV.blue }}>
                          {previewCols.map((col) => (
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
                            {previewCols.map((col) => (
                              <td
                                key={`${section.title}-${index}-${col.key}`}
                                className={cn(
                                  "border border-slate-200 px-3 py-1.5 text-xs",
                                  prototypeSection && isPrototypeRowHighlighted(row) ? "text-red-700" : "text-slate-800",
                                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                )}
                              >
                                {col.key === "mark" ? (
                                  <span className="inline-flex h-3.5 w-3.5 border border-slate-600" />
                                ) : isPreviewOnly || isSerialColumnKey(col.key) || (canAutoLineTotal(section) && lineTotalColumnKey(section) === col.key) ? (
                                  <span className="tabular-nums">{displayProjectTableCell(row, col, index, currency, section)}</span>
                                ) : (
                                  <div>
                                    <div className={col.key === "item" ? "flex items-start gap-2" : undefined}>
                                      <div className={col.key === "item" ? "min-w-0 flex-1" : undefined}>
                                        <SheetField
                                          editable
                                          value={sheetCellValue(row[col.key] ?? "")}
                                          onChange={(value) => updateProjectSectionCell(sectionIndex, index, col.key, value)}
                                          placeholder={sheetCellPlaceholder(row[col.key] ?? "", col.label)}
                                          inputMode={col.key === "qty" || col.key === "unitPrice" ? "decimal" : "text"}
                                          className={cn(
                                            "text-xs",
                                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                                            prototypeSection && isPrototypeRowHighlighted(row) ? "text-red-700" : "text-slate-800"
                                          )}
                                        />
                                      </div>
                                      {col.key === "item" && !isPreviewOnly ? (
                                        <button
                                          type="button"
                                          className="sheet-only-screen shrink-0 text-[10px] font-semibold text-red-600"
                                          onClick={() => removeProjectSectionRow(sectionIndex, index)}
                                        >
                                          Remove
                                        </button>
                                      ) : null}
                                    </div>
                                    {prototypeSection && col.key === "item" && !isPreviewOnly ? (
                                      <label className="sheet-only-screen mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500">
                                        <input
                                          type="checkbox"
                                          checked={isPrototypeRowHighlighted(row)}
                                          onChange={(e) => togglePrototypeSectionRowHighlight(sectionIndex, index, e.target.checked)}
                                          className="h-3 w-3 rounded border-slate-300"
                                        />
                                        Price unknown
                                      </label>
                                    ) : null}
                                  </div>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={Math.max(1, previewCols.length - 1)} className="border border-slate-200 px-3 py-1.5 text-right text-xs font-extrabold text-slate-900">
                            SUBTOTAL
                          </td>
                          <td className="border border-slate-200 px-3 py-1.5 text-right text-xs font-extrabold tabular-nums text-slate-900">
                            {money(getSectionSubtotal(section))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {!isPreviewOnly ? (
                    <button
                      type="button"
                      className="sheet-only-screen mt-2 text-xs font-semibold text-[#184a96]"
                      onClick={() => addProjectSectionRow(sectionIndex)}
                    >
                      Add line
                    </button>
                  ) : null}
                  </>
                  ) : null}
                </div>
                )
              })}

              {isDeliveryNote && (!isPreviewOnly || backorderedNote.trim()) ? (
                <div className="mt-3 px-6">
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-900">Missing / backordered items</p>
                  <SheetField
                    editable={!isPreviewOnly}
                    multiline
                    value={backorderedNote}
                    onChange={setBackorderedNote}
                    placeholder="Items still missing"
                    className="text-xs text-slate-600"
                  />
                </div>
              ) : null}

              {docLabels.showTotals ? (
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
                    <span>{docLabels.grandTotalLabel}</span>
                    <span className="tabular-nums">{currency} {money(effectiveGrandTotal)}</span>
                  </div>
                </div>
              </div>
              ) : null}

              {projectTables?.paymentSchedule?.length && docLabels.showPaymentSchedule && (showPaymentScheduleTable || !isPreviewOnly) ? (
                <div className="mt-2 px-6">
                  {!isPreviewOnly ? (
                    <label className="sheet-only-screen mb-1.5 flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={projectTables.hidePaymentSchedule !== true}
                        onChange={(event) => togglePaymentScheduleVisibility(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      Use payment schedule
                    </label>
                  ) : null}
                  {showPaymentScheduleTable && paymentScheduleDisplay.length ? (
                  <>
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
                  </>
                  ) : null}
                </div>
              ) : null}

              {docLabels.showPaymentMethods ? (
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
                          {!isPreviewOnly || pm.title.trim() ? (
                            <SheetField
                              editable={!isPreviewOnly}
                              value={pm.title}
                              onChange={(value) => updatePaymentMethod(pm.id, { title: value })}
                              placeholder="Payment label"
                              className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-700"
                            />
                          ) : null}
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account name</span>
                            <SheetField
                              editable={!isPreviewOnly}
                              value={pm.accountName}
                              onChange={(value) => updatePaymentMethod(pm.id, { accountName: value })}
                              placeholder="Account name"
                              className="font-bold text-slate-900"
                            />
                          </div>
                          <div className="mt-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Bank</span>
                            <SheetField
                              editable={!isPreviewOnly}
                              value={pm.bank}
                              onChange={(value) => updatePaymentMethod(pm.id, { bank: value })}
                              placeholder="Bank"
                              className="font-bold text-slate-900"
                            />
                          </div>
                          <div className="mt-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account</span>
                            <SheetField
                              editable={!isPreviewOnly}
                              value={pm.account}
                              onChange={(value) => updatePaymentMethod(pm.id, { account: value })}
                              placeholder="Account number"
                              className="font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              ) : null}

              {/* Terms + signature */}
              <div className="mt-2 grid grid-cols-1 gap-6 border-t border-slate-100 px-6 py-5 sm:grid-cols-[1fr_auto]">
                <div className="text-xs leading-relaxed text-slate-600">
                  {isPreviewOnly ? (
                    <p className="font-extrabold text-slate-900">{effectiveThankYou}</p>
                  ) : (
                    <SheetField
                      editable
                      value={thankYouLine}
                      onChange={setThankYouLine}
                      placeholder="Thank you line"
                      className="font-extrabold text-slate-900"
                    />
                  )}
                  <h4 className="mt-3 text-xs font-extrabold text-slate-900">{docLabels.termsHeading}</h4>
                  {isPreviewOnly ? (
                    <p
                      className="mt-1 whitespace-pre-line"
                      dangerouslySetInnerHTML={{ __html: convertInlineBoldToHtml(effectiveTerms || "—") }}
                    />
                  ) : (
                    <SheetField
                      editable
                      multiline
                      value={termsText}
                      onChange={setTermsText}
                      placeholder="Notes and terms. Use **bold** around words."
                      className="mt-1 text-xs leading-relaxed text-slate-600"
                    />
                  )}
                </div>
                <div className="w-full max-w-[280px] text-left sm:ml-auto sm:text-right">
                  {isDeliveryNote ? (
                    <p className="text-xs text-slate-600">Dispatched by: <span className="font-semibold text-slate-900">{signerName}</span></p>
                  ) : (
                  <>
                  <SheetField
                    editable={!isPreviewOnly}
                    value={signerName}
                    onChange={setSignerName}
                    placeholder="Signer name"
                    className="font-['Georgia',serif] text-lg italic text-slate-700 sm:text-right"
                  />
                  <SheetField
                    editable={!isPreviewOnly}
                    value={signerTitle}
                    onChange={setSignerTitle}
                    placeholder="Name"
                    className="mt-1 text-xs font-semibold text-slate-800 sm:text-right"
                  />
                  {signatureImage ? (
                    <div className="mt-2 flex justify-end">
                      <img src={signatureImage} alt="" className="block h-16 w-auto max-w-[170px] object-contain" />
                    </div>
                  ) : null}
                  {!isPreviewOnly ? (
                    <div className="sheet-only-screen mt-1 flex justify-end gap-2">
                      <input
                        ref={signatureInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleSignatureUpload}
                      />
                      <button type="button" className="text-[10px] font-semibold text-[#184a96]" onClick={() => signatureInputRef.current?.click()}>
                        {signatureImage ? "Change signature" : "Upload signature"}
                      </button>
                      {signatureImage ? (
                        <button type="button" className="text-[10px] font-semibold text-slate-500" onClick={clearSignature}>
                          Clear
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {stampImage ? (
                    <img
                      src={stampImage}
                      alt=""
                      className="ml-auto mt-2 block h-36 w-auto max-w-[280px] object-contain opacity-95"
                    />
                  ) : null}
                  {!isPreviewOnly ? (
                    <div className="sheet-only-screen mt-1 flex justify-end gap-2">
                      <input ref={stampInputRef} type="file" accept="image/png,image/webp,image/*" className="hidden" onChange={handleStampUpload} />
                      <button type="button" className="text-[10px] font-semibold text-[#184a96]" onClick={() => stampInputRef.current?.click()}>
                        {stampImage ? "Change stamp" : "Upload stamp"}
                      </button>
                      {stampImage ? (
                        <button type="button" className="text-[10px] font-semibold text-slate-500" onClick={clearStamp}>
                          Clear
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  </>
                  )}
                  {isQuotation ? (
                    <div className="mt-4 border-t border-dashed border-slate-300 pt-3 text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-700">{docLabels.acceptanceHeading}</p>
                      <p className="mt-3 text-[10px] text-slate-500">Signature</p>
                      <div className="ml-auto mt-1 h-6 max-w-[220px] border-b border-slate-400" />
                    </div>
                  ) : null}
                  {isDeliveryNote ? (
                    <div className="mt-4 border-t border-dashed border-slate-300 pt-3 text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-700">{docLabels.acceptanceHeading}</p>
                      <p className="mt-3 text-[10px] text-slate-500">Received by (print name)</p>
                      <div className="ml-auto mt-1 h-6 max-w-[220px] border-b border-slate-400" />
                      <p className="mt-3 text-[10px] text-slate-500">Signature</p>
                      <div className="ml-auto mt-1 h-6 max-w-[220px] border-b border-slate-400" />
                      <p className="mt-3 text-[10px] text-slate-500">Date received</p>
                      <div className="ml-auto mt-1 h-6 max-w-[220px] border-b border-slate-400" />
                      <p className="mt-3 text-[10px] text-slate-500">Comments (missing / damaged)</p>
                      <div className="ml-auto mt-1 h-10 max-w-[220px] border-b border-slate-400" />
                    </div>
                  ) : null}
                </div>
              </div>

              {!isQuotation && !isDeliveryNote && !isPreviewOnly ? (
                <label className="sheet-only-screen flex items-center gap-2 px-6 pt-4 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={showClientApproval}
                    onChange={(event) => setShowClientApproval(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Show client approval — sign & stamp
                </label>
              ) : null}
              {!isQuotation && !isDeliveryNote && showClientApproval ? (
                <div className="border-t border-slate-200 px-6 py-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-900">
                    {docLabels.acceptanceHeading}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] text-slate-500">Client name / authorised person</p>
                      <div className="mt-1 h-7 border-b border-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Date</p>
                      <div className="mt-1 h-7 border-b border-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Signature</p>
                      <div className="mt-1 h-10 border-b border-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Company stamp</p>
                      <div className="mt-1 h-14 border-b border-slate-400" />
                    </div>
                  </div>
                </div>
              ) : null}

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
                    <SheetField
                      editable={!isPreviewOnly}
                      value={footerPhone}
                      onChange={setFooterPhone}
                      placeholder="Phone"
                      className="text-xs text-slate-600"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border-2"
                      style={{ borderColor: INV.blue, color: INV.blue }}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <SheetField
                      editable={!isPreviewOnly}
                      value={footerEmail}
                      onChange={setFooterEmail}
                      placeholder="Email"
                      className="text-xs text-slate-600"
                    />
                  </div>
                  <div className="flex min-w-0 items-start gap-2 text-xs text-slate-600">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border-2"
                      style={{ borderColor: INV.blue, color: INV.blue }}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <SheetField
                      editable={!isPreviewOnly}
                      value={footerAddress}
                      onChange={setFooterAddress}
                      multiline
                      placeholder="Address"
                      className="break-words pt-0.5 text-xs text-slate-600"
                    />
                  </div>
                </div>
                {isQuotation ? (
                  <p className="mt-3 border-t border-slate-200 pt-3 text-center text-[11px] leading-relaxed text-slate-500">
                    {docLabels.preparedByLabel} {preparedByFooter}
                  </p>
                ) : null}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
  )
}
