import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const INVOICES_TABLE = "invoices"

type RawCatalogRow = {
  name: string
  quantity: number
  unitPrice: number
  savedAt: string
}

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

function parseQty(v: unknown): number {
  const n = parseMoney(v)
  if (n > 0) return Math.max(1, Math.round(n))
  return 1
}

function normalizeItemName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function isPlaceholderName(name: string): boolean {
  const n = String(name || "").trim()
  if (!n) return true
  if (/^e\.g\./i.test(n)) return true
  if (/^product or service$/i.test(n)) return true
  return false
}

function isExampleRow(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => /e\.g\./i.test(String(value || "")))
}

function extractItemsFromPayload(payload: any, savedAt: string): RawCatalogRow[] {
  const out: RawCatalogRow[] = []

  if (Array.isArray(payload?.items)) {
    for (const it of payload.items) {
      const name = String(it?.description || "").trim()
      if (isPlaceholderName(name)) continue
      out.push({
        name,
        quantity: parseQty(it?.quantity),
        unitPrice: parseMoney(it?.unitPrice),
        savedAt,
      })
    }
  }

  const sections = payload?.projectTables?.sections
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const cols = Array.isArray(section?.columns) ? section.columns : []
      const rows = Array.isArray(section?.rows) ? section.rows : []
      const itemKey = cols.find((c: any) => c?.key === "item")?.key || "item"
      const qtyKey = cols.find((c: any) => c?.key === "qty")?.key
      const unitKey = cols.find((c: any) => c?.key === "unitPrice")?.key

      for (const row of rows) {
        if (!row || typeof row !== "object") continue
        if (isExampleRow(row as Record<string, unknown>)) continue
        const name = String((row as any)[itemKey] || "").trim()
        if (isPlaceholderName(name)) continue
        out.push({
          name,
          quantity: qtyKey ? parseQty((row as any)[qtyKey]) : 1,
          unitPrice: unitKey ? parseMoney((row as any)[unitKey]) : 0,
          savedAt,
        })
      }
    }
  }

  return out
}

function dedupeCatalogRows(rows: RawCatalogRow[]) {
  const byName = new Map<string, RawCatalogRow>()
  for (const row of rows) {
    const key = normalizeItemName(row.name)
    if (!key) continue
    const prev = byName.get(key)
    if (!prev || row.savedAt > prev.savedAt) {
      byName.set(key, row)
    }
  }
  return Array.from(byName.entries())
    .map(([key, row]) => ({
      key,
      name: row.name,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

async function fetchInvoicesForScope(supabase: any, scope: "project" | "main" | "all") {
  let query = supabase
    .from(INVOICES_TABLE)
    .select("created_at, payload")
    .order("created_at", { ascending: false })
    .limit(1000)
    .or("payload->>usageTrackingRecord.is.null,payload->>usageTrackingRecord.eq.false")
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

    const scopeParam = String(request.nextUrl.searchParams.get("scope") || "all").toLowerCase()
    const scope: "project" | "main" | "all" =
      scopeParam === "project" ? "project" : scopeParam === "main" ? "main" : "all"

    const { data, error } = await fetchInvoicesForScope(supabase, scope)
    if (error) {
      return NextResponse.json({ error: "Failed to load saved line items", details: error.message }, { status: 500 })
    }

    const collected: RawCatalogRow[] = []
    for (const inv of data || []) {
      const payload = inv?.payload || {}
      const savedAt = String(inv?.created_at || "")
      collected.push(...extractItemsFromPayload(payload, savedAt))
    }

    return NextResponse.json({ success: true, items: dedupeCatalogRows(collected) })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}
