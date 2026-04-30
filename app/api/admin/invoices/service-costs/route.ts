import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"

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

function sectionSubtotal(section: any): number {
  const cols = Array.isArray(section?.columns) ? section.columns : []
  const rows = Array.isArray(section?.rows) ? section.rows : []
  const totalKey =
    cols.find((c: any) => /total/i.test(c?.key))?.key ??
    cols.find((c: any) => /amount/i.test(c?.key))?.key ??
    cols[cols.length - 1]?.key
  if (!totalKey) return 0
  return rows.reduce((sum: number, row: any) => sum + parseMoney(row?.[totalKey]), 0)
}

function allocateToSchedule(totalPaid: number, schedule: number[]): number[] {
  let remaining = Math.max(0, totalPaid)
  return schedule.map((a) => {
    const paid = Math.max(0, Math.min(a, remaining))
    remaining = Math.max(0, remaining - paid)
    return paid
  })
}

async function fetchInvoicesForScope(supabase: any, scope: "project" | "main" | "all") {
  let query = supabase
    .from(INVOICES_TABLE)
    .select("id, invoice_number, client_name, grand_total, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(500)
    .or("payload->>hiddenFromList.is.null,payload->>hiddenFromList.eq.false")

  if (scope === "project") {
    query = query.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
  } else if (scope === "main") {
    query = query.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
  }

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

    let { data, error } = await fetchInvoicesForScope(supabase, requestedScope)
    let scopeUsed: "project" | "main" | "all" = requestedScope

    // Legacy safety: if no scoped rows are found, fall back to all invoices.
    if (!error && requestedScope !== "all" && (!data || data.length === 0)) {
      const fallback = await fetchInvoicesForScope(supabase, "all")
      if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length > 0) {
        data = fallback.data
        scopeUsed = "all"
      }
    }
    if (error) {
      return NextResponse.json({ error: "Failed to load remaining prices", details: error.message }, { status: 500 })
    }

    const rows = (data || []).map((inv: any) => {
      const payload = inv?.payload || {}
      const sections = payload?.projectTables?.sections || []
      const material = (sections[0] ? sectionSubtotal(sections[0]) : 0) + (sections[1] ? sectionSubtotal(sections[1]) : 0)
      const serviceCost = sections[2] ? sectionSubtotal(sections[2]) : 0
      const paidTotal = Array.isArray(payload?.payments?.records)
        ? payload.payments.records.reduce((s: number, r: any) => s + Number(r?.amount || 0), 0)
        : 0

      // Preferred source: combined section 1 + 2 (items + product/material).
      // Legacy fallback: use grand_total when section data is unavailable.
      const totalPrice = material > 0 ? material : Number(inv?.grand_total || 0)
      // Avoid double-counting service on legacy records where grand_total already includes all sections.
      const combinedPrice = material > 0 ? totalPrice + serviceCost : totalPrice
      const totalPaid = Math.max(0, Math.min(combinedPrice, paidTotal))
      const totalDue = Math.max(0, combinedPrice - totalPaid)
      return {
        id: inv.id,
        invoice_number: inv.invoice_number || "",
        client_name: inv.client_name || "",
        created_at: inv.created_at || null,
        service_price: serviceCost,
        total_price: totalPrice,
        total_paid: totalPaid,
        total_due: totalDue,
      }
    })

    const summary = rows.reduce(
      (acc, r) => {
        acc.totalItemProductPrice += r.total_price
        acc.totalServicePrice += r.service_price
        acc.totalPrice += r.total_price + r.service_price
        acc.totalPaid += r.total_paid
        acc.totalDue += r.total_due
        return acc
      },
      {
        totalItemProductPrice: 0,
        totalServicePrice: 0,
        totalPrice: 0,
        totalPaid: 0,
        totalDue: 0,
      }
    )

    return NextResponse.json({ success: true, rows, summary, scopeUsed, totalCount: rows.length })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}

