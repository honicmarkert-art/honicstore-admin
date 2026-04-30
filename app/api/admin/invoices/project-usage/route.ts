import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const INVOICES_TABLE = "invoices"
const USAGE_RECORD_KEY = "usageTrackingRecord"

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

function getAdminClient() {
  try {
    return { client: createAdminSupabaseClient(), error: null as string | null }
  } catch (error: any) {
    return { client: null as any, error: error?.message || "Failed to create admin client" }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const { client: supabase, error: envError } = getAdminClient()
    if (envError) return NextResponse.json({ error: envError }, { status: 500 })

    const requestedClient = String(request.nextUrl.searchParams.get("clientName") || "").trim()

    const { data, error } = await supabase
      .from(INVOICES_TABLE)
      .select("id, client_name, grand_total, payload")
      .order("created_at", { ascending: false })
      .limit(1000)
      .or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
      .or("payload->>hiddenFromList.is.null,payload->>hiddenFromList.eq.false")

    if (error) {
      return NextResponse.json({ error: "Failed to load project usage", details: error.message }, { status: 500 })
    }

    const usageRecordsResult = await supabase
      .from(INVOICES_TABLE)
      .select("client_name, payload")
      .eq(`payload->>${USAGE_RECORD_KEY}`, "true")
      .limit(1000)

    const usageMap = new Map<
      string,
      {
        component: number
        prototype: number
        service: number
        componentNote: string
        prototypeNote: string
        serviceNote: string
      }
    >()
    for (const row of usageRecordsResult.data || []) {
      const key = String(row?.client_name || "Unknown").trim() || "Unknown"
      const entry = row?.payload?.projectUsageEntry || {}
      usageMap.set(key, {
        component: Number(entry.componentUsage || 0),
        prototype: Number(entry.prototypeUsage || 0),
        service: Number(entry.serviceUsed || 0),
        componentNote: String(entry.componentNote || ""),
        prototypeNote: String(entry.prototypeNote || ""),
        serviceNote: String(entry.serviceNote || ""),
      })
    }

    const bucket = new Map<string, any>()

    for (const inv of data || []) {
      const payload = inv?.payload || {}
      const sections = payload?.projectTables?.sections || []
      const componentUsage = sections[0] ? sectionSubtotal(sections[0]) : 0
      const prototypeUsage = sections[1] ? sectionSubtotal(sections[1]) : 0
      const serviceUsage = sections[2] ? sectionSubtotal(sections[2]) : 0

      const totalPriceFromSections = componentUsage + prototypeUsage + serviceUsage
      const totalPrice = totalPriceFromSections > 0 ? totalPriceFromSections : Number(inv?.grand_total || 0)
      const paidFromRecords = Array.isArray(payload?.payments?.records)
        ? payload.payments.records.reduce((s: number, r: any) => s + Number(r?.amount || 0), 0)
        : 0
      const priceUsed = Math.max(0, Math.min(totalPrice, paidFromRecords))
      const remainingPrice = Math.max(0, totalPrice - priceUsed)

      const key = String(inv?.client_name || "Unknown").trim() || "Unknown"
      const prev =
        bucket.get(key) || {
          client_name: key,
          real_component_price: 0,
          real_prototype_price: 0,
          real_service_price: 0,
          component_usage: 0,
          prototype_usage: 0,
          service_used: 0,
          total_price: 0,
          price_used: 0,
          remaining_price: 0,
          invoice_count: 0,
        }

      prev.real_component_price += componentUsage
      prev.real_prototype_price += prototypeUsage
      prev.real_service_price += serviceUsage
      prev.total_price += totalPrice
      prev.invoice_count += 1
      bucket.set(key, prev)
    }

    let rows = Array.from(bucket.values()).map((r) => {
      const used = usageMap.get(r.client_name) || {
        component: 0,
        prototype: 0,
        service: 0,
        componentNote: "",
        prototypeNote: "",
        serviceNote: "",
      }
      const usedTotal = Math.max(0, used.component) + Math.max(0, used.prototype) + Math.max(0, used.service)
      return {
        ...r,
        component_usage: used.component,
        prototype_usage: used.prototype,
        service_used: used.service,
        component_note: used.componentNote,
        prototype_note: used.prototypeNote,
        service_note: used.serviceNote,
        price_used: Math.max(0, Math.min(r.total_price, usedTotal)),
        remaining_price: Math.max(0, r.total_price - Math.max(0, Math.min(r.total_price, usedTotal))),
      }
    })

    if (requestedClient) {
      rows = rows.filter((r) => String(r.client_name || "").toLowerCase() === requestedClient.toLowerCase())
    }

    rows = rows.sort((a, b) => b.total_price - a.total_price)

    const summary = rows.reduce(
      (acc, r) => {
        acc.clientCount += 1
        acc.invoiceCount += r.invoice_count
        acc.componentUsage += r.component_usage
        acc.prototypeUsage += r.prototype_usage
        acc.serviceUsed += r.service_used
        acc.totalPrice += r.total_price
        acc.priceUsed += r.price_used
        acc.remainingPrice += r.remaining_price
        return acc
      },
      {
        clientCount: 0,
        invoiceCount: 0,
        componentUsage: 0,
        prototypeUsage: 0,
        serviceUsed: 0,
        totalPrice: 0,
        priceUsed: 0,
        remainingPrice: 0,
      }
    )

    return NextResponse.json({ success: true, rows, summary })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError
    const { client: supabase, error: envError } = getAdminClient()
    if (envError) return NextResponse.json({ error: envError }, { status: 500 })

    const body = await request.json()
    const clientName = String(body?.clientName || "").trim()
    const componentUsage = Math.max(0, Number(body?.componentUsage || 0))
    const prototypeUsage = Math.max(0, Number(body?.prototypeUsage || 0))
    const serviceUsed = Math.max(0, Number(body?.serviceUsed || 0))
    const componentNote = String(body?.componentNote || "")
    const prototypeNote = String(body?.prototypeNote || "")
    const serviceNote = String(body?.serviceNote || "")
    if (!clientName) {
      return NextResponse.json({ error: "clientName is required" }, { status: 400 })
    }

    const existing = await supabase
      .from(INVOICES_TABLE)
      .select("id, payload")
      .eq("client_name", clientName)
      .eq(`payload->>${USAGE_RECORD_KEY}`, "true")
      .limit(1)
      .maybeSingle()

    const projectUsageEntry = {
      componentUsage,
      prototypeUsage,
      serviceUsed,
      componentNote,
      prototypeNote,
      serviceNote,
      updatedAt: new Date().toISOString(),
    }

    if (existing.data?.id) {
      const payload = {
        ...(existing.data.payload || {}),
        [USAGE_RECORD_KEY]: true,
        hiddenFromList: true,
        dashboardScope: "project",
        projectUsageEntry,
      }
      const updated = await supabase
        .from(INVOICES_TABLE)
        .update({
          payload,
          grand_total: componentUsage + prototypeUsage + serviceUsed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.data.id)
        .select("id")
        .single()
      if (updated.error) {
        return NextResponse.json({ error: "Failed to update usage entry", details: updated.error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, id: updated.data.id })
    }

    const now = new Date().toISOString()
    const inserted = await supabase
      .from(INVOICES_TABLE)
      .insert({
        invoice_number: `USAGE-${Date.now()}`,
        client_name: clientName,
        issue_date: null,
        due_date: null,
        currency: "TZS",
        subtotal: componentUsage + prototypeUsage + serviceUsed,
        tax_amount: 0,
        grand_total: componentUsage + prototypeUsage + serviceUsed,
        payload: {
          [USAGE_RECORD_KEY]: true,
          hiddenFromList: true,
          dashboardScope: "project",
          projectUsageEntry,
        },
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single()

    if (inserted.error) {
      return NextResponse.json({ error: "Failed to create usage entry", details: inserted.error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: inserted.data.id })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}
