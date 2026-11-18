import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"
import { parseProjectYear, projectYearOrFilter, recordInProjectYear } from "@/lib/project-year"
import { invoiceCacheKey, readInvoiceCache, writeInvoiceCache } from "@/lib/invoice-read-cache"
import { SLIM_INVOICE_SELECT, withSlimPayload } from "@/lib/invoice-row"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const INVOICES_TABLE = "invoices"

function getAdminClient() {
  try {
    return { client: createAdminSupabaseClient(), error: null as string | null }
  } catch (error: any) {
    return { client: null as any, error: error?.message || "Failed to create admin client" }
  }
}

function parseMoney(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function isExampleValue(value: unknown): boolean {
  return /^\s*e\.g\./i.test(String(value ?? ""))
}

function sectionKind(title: unknown): "electrical" | "prototype" | "service" | "other" {
  const name = String(title || "").toLowerCase()
  if (name.includes("service")) return "service"
  if (name.includes("prototype")) return "prototype"
  if (name.includes("electric") || name.includes("component")) return "electrical"
  return "other"
}

function sectionSubtotal(section: any): number {
  const cols = Array.isArray(section?.columns) ? section.columns : []
  const rows = Array.isArray(section?.rows) ? section.rows : []
  const totalKey =
    cols.find((c: any) => /total|amount/i.test(String(c?.key || "")))?.key ??
    cols[cols.length - 1]?.key
  if (!totalKey) return 0
  return rows.reduce((sum: number, row: any) => {
    if (!row || typeof row !== "object") return sum
    if (isExampleValue(row.item) || isExampleValue(row.qty) || isExampleValue(row.unitPrice) || isExampleValue(row[totalKey])) return sum
    return sum + parseMoney(row[totalKey])
  }, 0)
}

function isFinancialInvoice(payload: any): boolean {
  if (payload?.usageTrackingRecord === true || payload?.usageTrackingRecord === "true") return false
  const kind = String(payload?.documentKind || "invoice")
  return kind === "invoice" || kind === ""
}

function allocateToSchedule(totalPaid: number, schedule: number[]): number[] {
  let remaining = Math.max(0, totalPaid)
  return schedule.map((a) => {
    const paid = Math.max(0, Math.min(a, remaining))
    remaining = Math.max(0, remaining - paid)
    return paid
  })
}

async function fetchInvoicesForScope(supabase: any, scope: "project" | "main" | "all", year: number | null) {
  let query = supabase
    .from(INVOICES_TABLE)
    .select(SLIM_INVOICE_SELECT)
    .order("issue_date", { ascending: false })
    .limit(1000)
    .or("payload->>hiddenFromList.is.null,payload->>hiddenFromList.eq.false")

  if (scope === "project") {
    query = query.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
  } else if (scope === "main") {
    query = query.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
  }
  if (year) query = query.or(projectYearOrFilter(year))

  return query
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const { client: supabase, error: envError } = getAdminClient()
    if (envError) return NextResponse.json({ error: envError }, { status: 500 })

    const scopeParam = String(request.nextUrl.searchParams.get("scope") || "project").toLowerCase()
    const requestedScope: "project" | "main" | "all" =
      scopeParam === "main" ? "main" : scopeParam === "all" ? "all" : "project"

    const cached = readInvoiceCache<Record<string, unknown>>(invoiceCacheKey(request.nextUrl))
    if (cached) return NextResponse.json(cached)

    const year = parseProjectYear(request.nextUrl.searchParams.get("year"))
    const { data, error } = await fetchInvoicesForScope(supabase, requestedScope, year)
    if (error) {
      return NextResponse.json({ error: "Failed to load remaining prices", details: error.message }, { status: 500 })
    }
    const source = (data || []).map((row: any) => withSlimPayload(row)).filter((row: any) => {
      if (!isFinancialInvoice(row?.payload)) return false
      return !year || recordInProjectYear(row, year)
    })

    const rows = source.map((inv: any) => {
      const payload = inv?.payload || {}
      const sections = Array.isArray(payload?.projectTables?.sections) ? payload.projectTables.sections : []
      const buckets = { electrical: 0, prototype: 0, service: 0, other: 0 }
      sections.forEach((section: any, index: number) => {
        if (section?.hidden === true) return
        const kind = sectionKind(section?.title) !== "other" ? sectionKind(section?.title) : index === 0 ? "electrical" : index === 1 ? "prototype" : index === 2 ? "service" : "other"
        buckets[kind] += sectionSubtotal(section)
      })
      const sectionTotal = buckets.electrical + buckets.prototype + buckets.service + buckets.other
      const tax = Math.max(0, Number(inv?.tax_amount || payload?.totals?.taxAmount || 0))
      const storedTotal = Math.max(0, Number(inv?.grand_total || 0))
      const invoiceTotal = sectionTotal > 0 ? sectionTotal + tax : storedTotal
      const paidTotal = Array.isArray(payload?.payments?.records)
        ? payload.payments.records.reduce((sum: number, record: any) => sum + Number(record?.amount || 0), 0)
        : 0
      const totalPaid = Math.max(0, Math.min(invoiceTotal, paidTotal))
      const material = buckets.electrical + buckets.prototype
      const service = buckets.service
      const scheduleBase = sectionTotal > 0 ? material + service : invoiceTotal
      const materialPart = sectionTotal > 0 ? material : Math.max(0, scheduleBase - service)
      const servicePart = Math.min(service, scheduleBase)
      const phaseAmounts = [
        Math.floor(materialPart / 2),
        materialPart - Math.floor(materialPart / 2),
        Math.floor(servicePart / 2),
        servicePart - Math.floor(servicePart / 2),
      ]
      return {
        id: inv.id,
        invoice_number: inv.invoice_number || "",
        client_name: inv.client_name || "",
        issue_date: inv.issue_date || payload.issueDate || null,
        created_at: inv.created_at || null,
        electrical: buckets.electrical,
        prototype: buckets.prototype,
        service,
        tax,
        total_price: invoiceTotal,
        total_paid: totalPaid,
        total_due: Math.max(0, invoiceTotal - totalPaid),
        phases: phaseAmounts,
      }
    })

    const summary = rows.reduce(
      (acc, row) => {
        acc.electrical += row.electrical
        acc.prototype += row.prototype
        acc.service += row.service
        acc.tax += row.tax
        acc.totalPrice += row.total_price
        acc.totalPaid += row.total_paid
        acc.totalDue += row.total_due
        acc.clients.add(String(row.client_name || "").trim().toLowerCase())
        row.phases.forEach((amount, index) => {
          acc.phases[index] += amount
        })
        return acc
      },
      {
        electrical: 0,
        prototype: 0,
        service: 0,
        tax: 0,
        totalPrice: 0,
        totalPaid: 0,
        totalDue: 0,
        phases: [0, 0, 0, 0],
        clients: new Set<string>(),
      }
    )
    const paidByPhase = allocateToSchedule(summary.totalPaid, summary.phases)

    const body = {
      success: true,
      rows,
      summary: {
        invoiceCount: rows.length,
        clientCount: Array.from(summary.clients).filter(Boolean).length,
        electrical: summary.electrical,
        prototype: summary.prototype,
        service: summary.service,
        tax: summary.tax,
        totalPrice: summary.totalPrice,
        totalPaid: summary.totalPaid,
        totalDue: summary.totalDue,
        phases: summary.phases.map((amount, index) => ({
          phase: String(index + 1),
          description: ["Material and components, first 50%", "Material and components, second 50%", "Service, first 50%", "Service, final 50%"][index],
          amount,
          paid: paidByPhase[index] || 0,
          due: Math.max(0, amount - (paidByPhase[index] || 0)),
        })),
      },
      totalCount: rows.length,
    }
    writeInvoiceCache(invoiceCacheKey(request.nextUrl), body)
    return NextResponse.json(body)
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}

