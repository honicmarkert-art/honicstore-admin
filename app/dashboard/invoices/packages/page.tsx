"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  blocksFromItems,
  emptyPackageBlock,
  isPackagePayload,
  itemsFromBlocks,
  lineAmount,
  type PackageBlock,
} from "@/lib/package-invoice"
import { COMPANY_ADDRESS_DEFAULT, COMPANY_ADDRESS_FOOTER, LOGO_PUBLIC_URL } from "@/lib/technical-report-defaults"

const BLUE = "#184a96"

type PaymentMethod = {
  id?: string
  title?: string
  accountName?: string
  bank?: string
  account?: string
}

type PackageDraft = {
  id: string | null
  invoiceNumber: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientAddress: string
  issueDate: string
  dueDate: string
  currency: string
  taxRate: number
  discount: number
  blocks: PackageBlock[]
  fromName: string
  companyTagline: string
  fromAddress: string
  companyWebsite: string
  footerPhone: string
  footerEmail: string
  footerAddress: string
  thankYouLine: string
  termsText: string
  signerName: string
  signerTitle: string
  invoiceLogo: string
  signatureImage: string
  paymentMethods: PaymentMethod[]
  raw: Record<string, any>
}

type ListRow = {
  id: string
  invoice_number: string
  client_name: string
  grand_total: number
  currency: string
  payload?: unknown
  hiddenFromList?: boolean
}

function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatLongDate(iso: string): string {
  if (!iso) return "—"
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function companyDefaults(): Omit<PackageDraft, "id" | "invoiceNumber" | "clientName" | "clientEmail" | "clientPhone" | "clientAddress" | "issueDate" | "dueDate" | "blocks" | "raw"> {
  return {
    currency: "TZS",
    taxRate: 0,
    discount: 0,
    fromName: "Honic Company Store",
    companyTagline: "ONLINE RETAIL",
    fromAddress: COMPANY_ADDRESS_DEFAULT,
    companyWebsite: "honiccompanystore.com",
    footerPhone: "+255 786 957 939",
    footerEmail: "support@honiccompany.com",
    footerAddress: COMPANY_ADDRESS_FOOTER,
    thankYouLine: "Thank you for your business.",
    termsText: "Payment is due within 7 days. Please use the invoice number as your payment reference.",
    signerName: "Authorized Signatory",
    signerTitle: "Abdulaziz Halekwa G.",
    invoiceLogo: LOGO_PUBLIC_URL,
    signatureImage: "",
    paymentMethods: [
      { id: "pm-1", title: "LIPA NAMBA", accountName: "HONIC COMPANY LIMITED", bank: "SELCOM PESA", account: "6123 8368" },
    ],
  }
}

function blankDraft(): PackageDraft {
  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 7)
  return {
    id: null,
    invoiceNumber: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    issueDate: isoDate(today),
    dueDate: isoDate(due),
    blocks: [emptyPackageBlock("package")],
    raw: { dashboardScope: "main", documentKind: "invoice", invoiceLayout: "package" },
    ...companyDefaults(),
  }
}

function draftFromInvoice(invoice: any): PackageDraft {
  const payload = (invoice?.payload || {}) as Record<string, any>
  const defaults = companyDefaults()
  return {
    id: String(invoice?.id || ""),
    invoiceNumber: String(invoice?.invoice_number || payload.invoiceNumber || ""),
    clientName: String(invoice?.client_name || payload.clientName || ""),
    clientEmail: String(payload.clientEmail || ""),
    clientPhone: String(payload.clientPhone || ""),
    clientAddress: String(payload.clientAddress || ""),
    issueDate: String(invoice?.issue_date || payload.issueDate || ""),
    dueDate: String(invoice?.due_date || payload.dueDate || ""),
    currency: String(invoice?.currency || payload.currency || defaults.currency),
    taxRate: Number(payload.taxRate || 0),
    discount: Number(payload.discount || 0),
    blocks: blocksFromItems(payload.items),
    fromName: String(payload.fromName || defaults.fromName),
    companyTagline: String(payload.companyTagline || defaults.companyTagline),
    fromAddress: String(payload.fromAddress || defaults.fromAddress),
    companyWebsite: String(payload.companyWebsite || defaults.companyWebsite),
    footerPhone: String(payload.footerPhone || defaults.footerPhone),
    footerEmail: String(payload.footerEmail || defaults.footerEmail),
    footerAddress: String(payload.footerAddress || defaults.footerAddress),
    thankYouLine: String(payload.thankYouLine || defaults.thankYouLine),
    termsText: String(payload.termsText || defaults.termsText),
    signerName: String(payload.signerName || defaults.signerName),
    signerTitle: String(payload.signerTitle || defaults.signerTitle),
    invoiceLogo: String(payload.invoiceLogo || defaults.invoiceLogo),
    signatureImage: String(payload.signatureImage || ""),
    paymentMethods: Array.isArray(payload.paymentMethods) && payload.paymentMethods.length ? payload.paymentMethods : defaults.paymentMethods,
    raw: payload,
  }
}

function totalsFor(draft: PackageDraft) {
  const subtotal = draft.blocks.reduce((sum, block) => sum + lineAmount(block), 0)
  const taxAmount = (subtotal * (Number(draft.taxRate) || 0)) / 100
  const grandTotal = Math.max(0, subtotal + taxAmount - (Number(draft.discount) || 0))
  return { subtotal, taxAmount, grandTotal }
}

function buildPackageHtml(draft: PackageDraft): string {
  const { subtotal, taxAmount, grandTotal } = totalsFor(draft)
  const currency = draft.currency || "TZS"
  const packages = draft.blocks.filter((block) => block.kind === "package")
  const charges = draft.blocks.filter((block) => block.kind === "charge")
  const website = draft.companyWebsite.replace(/^https?:\/\//, "")
  const websiteHref = /^https?:\/\//i.test(draft.companyWebsite) ? draft.companyWebsite : `https://${website}`
  const contact = [draft.clientEmail, draft.clientPhone, draft.clientAddress].filter((line) => line.trim())
  const packageHtml = packages
    .map((block, index) => {
      const offers = block.offers.map((offer) => offer.trim()).filter(Boolean)
      const offerHtml = offers.length
        ? `<ul>${offers.map((offer) => `<li>${escapeHtml(offer)}</li>`).join("")}</ul>`
        : `<p class="empty">No offer written for this package.</p>`
      const qty = block.quantity === 1 ? "" : `<span class="qty">${escapeHtml(String(block.quantity))} × </span>`
      return `<section class="pkg">
        <div class="pkg-top">
          <div>
            <p class="kicker">Service package ${String(index + 1).padStart(2, "0")}</p>
            <h2>${escapeHtml(block.name || "Package")}</h2>
          </div>
          <p class="price">${qty}${escapeHtml(currency)} ${money(lineAmount(block))}</p>
        </div>
        <p class="offer-label">What this package offers</p>
        ${offerHtml}
      </section>`
    })
    .join("")
  const chargeHtml = charges.length
    ? `<section class="charges">
        <p class="offer-label">Other charges</p>
        ${charges
          .map(
            (block) => `<div class="charge">
              <span>${escapeHtml(block.name || "Charge")}${block.quantity === 1 ? "" : ` × ${escapeHtml(String(block.quantity))}`}</span>
              <strong>${escapeHtml(currency)} ${money(lineAmount(block))}</strong>
            </div>`
          )
          .join("")}
      </section>`
    : ""
  const paymentHtml = draft.paymentMethods
    .map((method) => {
      const lines = [
        method.title ? `<p class="pay-title">${escapeHtml(method.title)}</p>` : "",
        method.accountName ? `<p><span>Account name</span>${escapeHtml(method.accountName)}</p>` : "",
        method.bank ? `<p><span>Bank</span>${escapeHtml(method.bank)}</p>` : "",
        method.account ? `<p><span>Account</span>${escapeHtml(method.account)}</p>` : "",
      ].join("")
      return lines ? `<div class="pay">${lines}</div>` : ""
    })
    .join("")
  const logo = draft.invoiceLogo
    ? `<img src="${escapeHtml(draft.invoiceLogo)}" alt="" />`
    : ""
  const signature = draft.signatureImage
    ? `<img class="sig" src="${escapeHtml(draft.signatureImage)}" alt="" />`
    : ""
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(draft.invoiceNumber || "Package invoice")}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
    .page { max-width: 820px; margin: 0 auto; padding: 28px 32px 36px; }
    .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .brand img { width: 64px; height: 64px; object-fit: contain; }
    .co { font-size: 18px; font-weight: 800; }
    .tag { margin-top: 3px; font-size: 10px; letter-spacing: 0.14em; color: #64748b; }
    .addr { margin-top: 6px; white-space: pre-line; font-size: 11px; color: #475569; line-height: 1.4; }
    .doc { text-align: right; }
    .doc h1 { margin: 0; color: ${BLUE}; font-size: 22px; letter-spacing: 0.04em; text-transform: uppercase; }
    .doc p { margin: 4px 0 0; font-size: 12px; color: #334155; }
    .rule { height: 4px; background: ${BLUE}; margin: 16px 0; }
    .meta { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
    .to-label, .offer-label { margin: 0 0 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${BLUE}; }
    .to-name { margin: 0; font-size: 18px; font-weight: 800; }
    .contact { margin: 6px 0 0; white-space: pre-line; font-size: 12px; color: #475569; line-height: 1.45; }
    .inv-meta { text-align: right; font-size: 12px; color: #334155; }
    .inv-meta strong { display: block; font-size: 14px; color: #0f172a; }
    .pkg { border-top: 1px solid #e2e8f0; padding: 16px 0; }
    .pkg-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .kicker { margin: 0; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; }
    h2 { margin: 4px 0 0; font-size: 18px; }
    .price { margin: 0; font-size: 16px; font-weight: 800; white-space: nowrap; }
    .qty { font-weight: 600; color: #475569; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 4px 0; font-size: 13px; line-height: 1.45; }
    .empty { margin: 8px 0 0; font-size: 12px; color: #64748b; }
    .charges { border-top: 1px solid #e2e8f0; padding-top: 14px; }
    .charge { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 6px 0; }
    .totals { margin-top: 16px; margin-left: auto; width: 280px; }
    .sum { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; color: #334155; }
    .grand { margin-top: 6px; background: ${BLUE}; color: #fff; display: flex; justify-content: space-between; padding: 12px 14px; font-weight: 800; }
    .pay { margin-top: 16px; border-left: 4px solid ${BLUE}; padding-left: 12px; }
    .pay-title { margin: 0 0 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .pay p { margin: 0 0 4px; font-size: 12px; }
    .pay span { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }
    .foot { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
    .terms { flex: 1; font-size: 12px; color: #475569; line-height: 1.5; }
    .terms h3 { margin: 8px 0 4px; font-size: 12px; color: #111; }
    .sign { text-align: right; min-width: 180px; }
    .sign .who { margin: 0; font-family: Georgia, serif; font-style: italic; font-size: 18px; }
    .sign .title { margin: 4px 0 0; font-size: 11px; color: #64748b; }
    .sig { max-width: 160px; max-height: 64px; object-fit: contain; }
    .icons { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #475569; }
    @page { size: A4; margin: 10mm; }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div class="brand">
        ${logo}
        <div>
          <div class="co">${escapeHtml(draft.fromName)}</div>
          <div class="tag">${escapeHtml(draft.companyTagline)}</div>
          ${draft.fromAddress.trim() ? `<div class="addr">${escapeHtml(draft.fromAddress)}</div>` : ""}
        </div>
      </div>
      <div class="doc">
        <h1>Service packages</h1>
        <p>${escapeHtml(draft.invoiceNumber || "Draft")}</p>
        <p><a href="${escapeHtml(websiteHref)}">${escapeHtml(website)}</a></p>
      </div>
    </div>
    <div class="rule"></div>
    <div class="meta">
      <div>
        <p class="to-label">Invoice to</p>
        <p class="to-name">${escapeHtml(draft.clientName || "Client name")}</p>
        ${contact.length ? `<p class="contact">${escapeHtml(contact.join("\n"))}</p>` : ""}
      </div>
      <div class="inv-meta">
        <strong>Invoice ${escapeHtml(draft.invoiceNumber || "—")}</strong>
        <p>Issued ${escapeHtml(formatLongDate(draft.issueDate))}</p>
        <p>Due ${escapeHtml(formatLongDate(draft.dueDate))}</p>
      </div>
    </div>
    ${packageHtml}
    ${chargeHtml}
    <div class="totals">
      <div class="sum"><span>Subtotal</span><span>${escapeHtml(currency)} ${money(subtotal)}</span></div>
      <div class="sum"><span>Tax ${escapeHtml(String(draft.taxRate))}%</span><span>${escapeHtml(currency)} ${money(taxAmount)}</span></div>
      ${draft.discount ? `<div class="sum"><span>Discount</span><span>${escapeHtml(currency)} ${money(draft.discount)}</span></div>` : ""}
      <div class="grand"><span>Total</span><span>${escapeHtml(currency)} ${money(grandTotal)}</span></div>
    </div>
    ${paymentHtml}
    <div class="foot">
      <div class="terms">
        <p><strong>${escapeHtml(draft.thankYouLine)}</strong></p>
        <h3>Terms</h3>
        <p>${escapeHtml(draft.termsText)}</p>
      </div>
      <div class="sign">
        ${signature}
        <p class="who">${escapeHtml(draft.signerName)}</p>
        <p class="title">${escapeHtml(draft.signerTitle)}</p>
      </div>
    </div>
    <div class="icons">
      <span>${escapeHtml(draft.footerPhone)}</span>
      <span>${escapeHtml(draft.footerEmail)}</span>
      <span>${escapeHtml(draft.footerAddress)}</span>
    </div>
  </div>
</body>
</html>`
}

function printPackageInvoice(draft: PackageDraft) {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("title", "Package invoice print")
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(buildPackageHtml(draft))
  doc.close()
  window.setTimeout(() => {
    win.focus()
    win.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 300)
}

export default function PackageInvoicesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { themeClasses } = useTheme()
  const invoiceId = searchParams.get("invoiceId")
  const [rows, setRows] = useState<ListRow[]>([])
  const [reloadTick, setReloadTick] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PackageDraft | null>(null)

  const packageRows = useMemo(() => rows.filter((row) => isPackagePayload(row.payload)), [rows])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setListLoading(true)
      try {
        const res = await fetch("/api/admin/invoices?limit=100&scope=main", {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load invoices")
        setRows(Array.isArray(data.invoices) ? data.invoices : [])
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load invoices")
        }
      } finally {
        if (!controller.signal.aborted) setListLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [reloadTick])

  useEffect(() => {
    if (listLoading || invoiceId || creating || packageRows.length === 0) return
    router.replace(`/dashboard/invoices/packages?invoiceId=${packageRows[0].id}`)
  }, [listLoading, invoiceId, creating, packageRows, router])

  useEffect(() => {
    if (invoiceId || !creating) return
    setDraft(blankDraft())
  }, [invoiceId, creating])

  useEffect(() => {
    if (!invoiceId) return
    const controller = new AbortController()
    const load = async () => {
      setDocLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load invoice")
        if (!isPackagePayload(data.invoice?.payload)) {
          setDraft(null)
          setError("This saved invoice is not a package invoice.")
          return
        }
        setDraft(draftFromInvoice(data.invoice))
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load invoice")
        }
      } finally {
        if (!controller.signal.aborted) setDocLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [invoiceId])

  const packages = draft?.blocks.filter((block) => block.kind === "package") || []
  const charges = draft?.blocks.filter((block) => block.kind === "charge") || []
  const totals = draft ? totalsFor(draft) : { subtotal: 0, taxAmount: 0, grandTotal: 0 }

  const updateBlock = (id: string, patch: Partial<PackageBlock>) => {
    setDraft((current) =>
      current
        ? { ...current, blocks: current.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)) }
        : current
    )
  }

  const updateOffer = (id: string, index: number, value: string) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== id) return block
          const offers = block.offers.length ? [...block.offers] : [""]
          offers[index] = value
          return { ...block, offers }
        }),
      }
    })
  }

  const addOffer = (id: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: current.blocks.map((block) =>
              block.id === id ? { ...block, offers: [...(block.offers.length ? block.offers : [""]), ""] } : block
            ),
          }
        : current
    )
  }

  const removeOffer = (id: string, index: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: current.blocks.map((block) =>
              block.id === id ? { ...block, offers: block.offers.filter((_, offerIndex) => offerIndex !== index) } : block
            ),
          }
        : current
    )
  }

  const addBlock = (kind: PackageBlock["kind"]) => {
    setDraft((current) => (current ? { ...current, blocks: [...current.blocks, emptyPackageBlock(kind)] } : current))
  }

  const removeBlock = (id: string) => {
    setDraft((current) => {
      if (!current) return current
      const blocks = current.blocks.filter((block) => block.id !== id)
      return { ...current, blocks: blocks.length ? blocks : [emptyPackageBlock("package")] }
    })
  }

  const startNew = () => {
    setCreating(true)
    setError(null)
    setDraft(blankDraft())
    router.push("/dashboard/invoices/packages")
  }

  const save = async () => {
    if (!draft) return
    const clientName = draft.clientName.trim()
    if (!clientName) {
      toast({ title: "Client name required", description: "Enter the client before saving this package invoice.", variant: "destructive" })
      return
    }
    const named = draft.blocks.filter((block) => block.name.trim())
    if (!named.length) {
      toast({ title: "Package name required", description: "Name at least one package or charge.", variant: "destructive" })
      return
    }
    const missingName = draft.blocks.some((block) => !block.name.trim() && (block.unitPrice !== 0 || block.offers.some((offer) => offer.trim())))
    if (missingName) {
      toast({ title: "Name missing", description: "Each package or charge with a price or an offer needs a name.", variant: "destructive" })
      return
    }
    const items = itemsFromBlocks(named)
    const savedTotals = totalsFor({ ...draft, blocks: named })
    const body = {
      ...draft.raw,
      invoiceId: draft.id || undefined,
      invoiceNumber: draft.invoiceNumber,
      documentKind: "invoice",
      invoiceLayout: "package",
      dashboardScope: draft.raw.dashboardScope || "main",
      clientName,
      clientEmail: draft.clientEmail,
      clientPhone: draft.clientPhone,
      clientAddress: draft.clientAddress,
      issueDate: draft.issueDate,
      dueDate: draft.dueDate,
      currency: draft.currency,
      taxRate: draft.taxRate,
      discount: draft.discount,
      fromName: draft.fromName,
      companyTagline: draft.companyTagline,
      fromAddress: draft.fromAddress,
      companyWebsite: draft.companyWebsite,
      footerPhone: draft.footerPhone,
      footerEmail: draft.footerEmail,
      footerAddress: draft.footerAddress,
      thankYouLine: draft.thankYouLine,
      termsText: draft.termsText,
      signerName: draft.signerName,
      signerTitle: draft.signerTitle,
      invoiceLogo: draft.invoiceLogo,
      signatureImage: draft.signatureImage,
      paymentMethods: draft.paymentMethods,
      itemsTableTitle: "Service packages",
      items,
      totals: savedTotals,
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || data?.details || "Failed to save invoice")
      const nextId = String(data?.invoice?.id || draft.id || "")
      const nextNumber = String(data?.invoice?.invoice_number || draft.invoiceNumber)
      toast({ title: "Package invoice saved", description: `${nextNumber} saved for ${clientName}.` })
      setCreating(false)
      setReloadTick((tick) => tick + 1)
      if (nextId && nextId !== invoiceId) {
        router.replace(`/dashboard/invoices/packages?invoiceId=${nextId}`)
      } else if (data?.invoice) {
        setDraft(draftFromInvoice(data.invoice))
      }
    } catch (saveError) {
      toast({
        title: "Save failed",
        description: saveError instanceof Error ? saveError.message : "Could not save the package invoice.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className={cn("min-w-0 space-y-3", themeClasses.mainText)}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Package invoices</h1>
          <p className={cn("mt-1 text-sm", themeClasses.textNeutralSecondary)}>Service packages, with the offer listed under each package.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={startNew}>New</Button>
          <Button type="button" onClick={save} disabled={!draft || saving || docLoading}>{saving ? "Saving..." : "Save"}</Button>
          <Button type="button" variant="outline" onClick={() => draft && printPackageInvoice(draft)} disabled={!draft}>Print</Button>
        </div>
        <div className="space-y-2">
          {listLoading ? <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>Loading package invoices...</p> : null}
          {!listLoading && packageRows.length === 0 ? <p className={cn("text-sm", themeClasses.textNeutralSecondary)}>No package invoices yet.</p> : null}
          {packageRows.map((row) => (
            <Link
              key={row.id}
              href={`/dashboard/invoices/packages?invoiceId=${row.id}`}
              onClick={() => setCreating(false)}
              className={cn(
                "block rounded-md border px-3 py-2 text-sm",
                row.id === invoiceId ? "border-current bg-black/5" : themeClasses.cardBorder
              )}
            >
              <span className="block font-medium">{row.client_name || "Client"}</span>
              <span className={cn("mt-0.5 block text-xs", themeClasses.textNeutralSecondary)}>
                {row.invoice_number || "Draft"} · {row.currency || "TZS"} {money(Number(row.grand_total || 0))}
                {row.hiddenFromList ? " · Hidden" : ""}
              </span>
            </Link>
          ))}
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard/invoices/list">All invoices</Link>
        </Button>
      </aside>

      <section className="min-w-0">
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {docLoading ? <p className="text-sm text-slate-500">Loading package invoice...</p> : null}
        {!docLoading && !draft ? <p className="text-sm text-slate-500">Choose a package invoice, or start a new one.</p> : null}
        {draft ? (
          <article className="overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-sm">
            <header className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {draft.invoiceLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.invoiceLogo} alt="" className="h-14 w-14 shrink-0 object-contain" />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold">{draft.fromName}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{draft.companyTagline}</p>
                  {draft.fromAddress ? <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{draft.fromAddress}</p> : null}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-xl font-extrabold uppercase tracking-wide" style={{ color: BLUE }}>Service packages</p>
                <p className="text-sm text-slate-600">{draft.invoiceNumber || "New invoice"}</p>
              </div>
            </header>
            <div className="h-1" style={{ background: BLUE }} />

            <div className="grid gap-4 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: BLUE }}>Invoice to</p>
                <Input
                  value={draft.clientName}
                  onChange={(event) => setDraft({ ...draft, clientName: event.target.value })}
                  placeholder="Client name"
                  className="mt-1 h-auto border-0 bg-transparent px-0 text-xl font-extrabold shadow-none focus-visible:ring-0"
                />
                <Input
                  value={draft.clientEmail}
                  onChange={(event) => setDraft({ ...draft, clientEmail: event.target.value })}
                  placeholder="Email, if you have it"
                  className="h-8 border-0 bg-transparent px-0 text-sm text-slate-600 shadow-none focus-visible:ring-0"
                />
                <Input
                  value={draft.clientPhone}
                  onChange={(event) => setDraft({ ...draft, clientPhone: event.target.value })}
                  placeholder="Phone, if you have it"
                  className="h-8 border-0 bg-transparent px-0 text-sm text-slate-600 shadow-none focus-visible:ring-0"
                />
                <Textarea
                  value={draft.clientAddress}
                  onChange={(event) => setDraft({ ...draft, clientAddress: event.target.value })}
                  placeholder="Address, if you have it"
                  rows={2}
                  className="min-h-0 resize-none border-0 bg-transparent px-0 text-sm text-slate-600 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="text-sm text-slate-600 md:text-right">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Issued</span>
                  <Input type="date" value={draft.issueDate} onChange={(event) => setDraft({ ...draft, issueDate: event.target.value })} className="md:ml-auto md:w-40" />
                </label>
                <label className="mt-2 block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due</span>
                  <Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="md:ml-auto md:w-40" />
                </label>
              </div>
            </div>

            {packages.map((block, index) => {
              const offers = block.offers.length ? block.offers : [""]
              return (
                <section key={block.id} className="border-t border-slate-200 px-4 py-5 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                        Service package {String(index + 1).padStart(2, "0")}
                      </p>
                      <Input
                        value={block.name}
                        onChange={(event) => updateBlock(block.id, { name: event.target.value })}
                        placeholder="Package name"
                        className="mt-1 h-auto border-0 bg-transparent px-0 text-lg font-bold shadow-none focus-visible:ring-0"
                      />
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="text-base font-extrabold">
                        {block.quantity === 1 ? "" : `${block.quantity} × `}
                        {draft.currency} {money(lineAmount(block))}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                        <label className="text-xs text-slate-500">
                          Qty
                          <Input
                            type="number"
                            min={1}
                            value={block.quantity}
                            onChange={(event) => updateBlock(block.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                            className="ml-1 h-8 w-16"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Price
                          <Input
                            type="number"
                            min={0}
                            value={block.unitPrice}
                            onChange={(event) => updateBlock(block.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                            className="ml-1 h-8 w-32"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
                    What this package offers
                  </p>
                  <ul className="mt-2 space-y-1">
                    {offers.map((offer, offerIndex) => (
                      <li key={`${block.id}-offer-${offerIndex}`} className="flex min-w-0 items-start gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BLUE }} />
                        <Input
                          value={offer}
                          onChange={(event) => updateOffer(block.id, offerIndex, event.target.value)}
                          placeholder="What this package includes"
                          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeOffer(block.id, offerIndex)}>
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => addOffer(block.id)}>Add an offer</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeBlock(block.id)}>Remove package</Button>
                  </div>
                </section>
              )
            })}

            {charges.length ? (
              <section className="border-t border-slate-200 px-4 py-5 sm:px-6">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: BLUE }}>Other charges</p>
                <div className="mt-3 space-y-3">
                  {charges.map((block) => (
                    <div key={block.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Input
                        value={block.name}
                        onChange={(event) => updateBlock(block.id, { name: event.target.value })}
                        placeholder="Charge name"
                        className="h-9 min-w-0 flex-1"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={block.quantity}
                          onChange={(event) => updateBlock(block.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                          className="h-9 w-16"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={block.unitPrice}
                          onChange={(event) => updateBlock(block.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                          className="h-9 w-32"
                        />
                        <p className="text-sm font-bold">{draft.currency} {money(lineAmount(block))}</p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeBlock(block.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
              <Button type="button" variant="outline" size="sm" onClick={() => addBlock("package")}>Add package</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addBlock("charge")}>Add charge</Button>
            </div>

            <div className="border-t border-slate-200 px-4 py-5 sm:px-6">
              <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{draft.currency} {money(totals.subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Tax {draft.taxRate}%</span><span>{draft.currency} {money(totals.taxAmount)}</span></div>
                <div className="flex justify-between px-3 py-3 font-extrabold text-white" style={{ background: BLUE }}>
                  <span>Total</span>
                  <span>{draft.currency} {money(totals.grandTotal)}</span>
                </div>
              </div>
              <div className="mt-5 space-y-3 border-l-4 pl-3" style={{ borderColor: BLUE }}>
                {draft.paymentMethods.map((method, index) => (
                  <div key={method.id || index} className="text-sm">
                    {method.title ? <p className="text-[11px] font-extrabold uppercase tracking-wide">{method.title}</p> : null}
                    {method.accountName ? <p>Account name: {method.accountName}</p> : null}
                    {method.bank ? <p>Bank: {method.bank}</p> : null}
                    {method.account ? <p>Account: {method.account}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            <footer className="grid gap-6 border-t border-slate-200 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_200px]">
              <div className="text-sm text-slate-600">
                <p className="font-bold text-slate-900">{draft.thankYouLine}</p>
                <p className="mt-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-900">Terms</p>
                <p className="mt-1 whitespace-pre-line">{draft.termsText}</p>
              </div>
              <div className="md:text-right">
                {draft.signatureImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.signatureImage} alt="" className="mb-2 ml-auto max-h-16 max-w-[160px] object-contain" />
                ) : null}
                <p className="font-serif text-lg italic">{draft.signerName}</p>
                <p className="text-xs text-slate-500">{draft.signerTitle}</p>
                {draft.id ? (
                  <Link href={`/dashboard/invoices?invoiceId=${draft.id}&mode=edit`} className="mt-3 inline-block text-xs text-slate-500 underline">
                    Open in Invoice Studio
                  </Link>
                ) : null}
              </div>
            </footer>
            <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
              <span>{draft.footerPhone}</span>
              <span>{draft.footerEmail}</span>
              <span className="sm:max-w-[40%] sm:text-right">{draft.footerAddress}</span>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  )
}
