import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
const INVOICES_TABLE = "invoices"

const saveInvoiceSchema = z.object({
  invoiceNumber: z.string().optional().default(""),
  dashboardScope: z.enum(["main", "project"]).optional().default("main"),
  clientName: z.string().min(1),
  issueDate: z.string().optional().default(""),
  dueDate: z.string().optional().default(""),
  currency: z.string().optional().default("TZS"),
  totals: z
    .object({
      subtotal: z.coerce.number().nonnegative().default(0),
      taxAmount: z.coerce.number().nonnegative().default(0),
      grandTotal: z.coerce.number().nonnegative().default(0),
    })
    .default({ subtotal: 0, taxAmount: 0, grandTotal: 0 }),
})

async function generateNextInvoiceNumber(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from(INVOICES_TABLE)
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  const year = new Date().getFullYear()
  const pattern = new RegExp(`^INV-${year}-HCIR-(\\d+)$`)

  const maxNum = (data || []).reduce((max: number, row: any) => {
    const raw = String(row?.invoice_number || "").trim()
    const m = raw.match(pattern)
    const n = m ? Number(m[1]) : Number.NaN
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
  const next = String(maxNum + 1).padStart(4, "0")
  return `INV-${year}-HCIR-${next}`
}

function getAdminClient() {
  try {
    return { client: createAdminSupabaseClient(), error: null as string | null }
  } catch (error: any) {
    return { client: null as any, error: error?.message || "Failed to create admin client" }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await validateAdminAccess()
    if (authError) return authError

    const { client: supabase, error: envError } = getAdminClient()
    if (envError) {
      return NextResponse.json({ error: "Server not configured", details: envError }, { status: 500 })
    }

    const body = await request.json()
    const parsed = saveInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid invoice payload", details: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      )
    }
    const invoice = parsed.data
    const clientName = invoice.clientName.trim()

    let insertResult: any = null
    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date().toISOString()
      const generatedInvoiceNumber = await generateNextInvoiceNumber(supabase)
      const record = {
        invoice_number: generatedInvoiceNumber,
        client_name: clientName,
        issue_date: invoice.issueDate || null,
        due_date: invoice.dueDate || null,
        currency: invoice.currency || "TZS",
        subtotal: invoice.totals.subtotal,
        tax_amount: invoice.totals.taxAmount,
        grand_total: invoice.totals.grandTotal,
        created_by: user?.id || null,
        payload: { ...body, dashboardScope: invoice.dashboardScope, invoiceNumber: generatedInvoiceNumber },
        created_at: now,
        updated_at: now,
      }
      insertResult = await supabase.from(INVOICES_TABLE).insert(record).select().single()
      if (!insertResult.error) break
      lastError = insertResult.error
      // Retry only on duplicate invoice number race.
      if (String(insertResult.error?.code || "") !== "23505") break
    }

    if (insertResult.error) {
      return NextResponse.json(
        {
          error: "Failed to save invoice",
          details: insertResult.error.message || lastError?.message,
          hint: `Ensure table '${INVOICES_TABLE}' exists and matches the migration schema.`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, invoice: insertResult.data })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error?.message || "Unknown error" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const { client: supabase, error: envError } = getAdminClient()
    if (envError) {
      return NextResponse.json({ error: "Server not configured", details: envError }, { status: 500 })
    }

    const q = String(request.nextUrl.searchParams.get("clientName") || "").trim()
    const scope = request.nextUrl.searchParams.get("scope") === "project" ? "project" : "main"
    const summaryOnly = request.nextUrl.searchParams.get("summaryOnly") === "true"
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)))

    let invoices: any[] = []
    if (!summaryOnly) {
      let query = supabase
        .from(INVOICES_TABLE)
        .select("id, invoice_number, client_name, issue_date, due_date, currency, grand_total, created_at")
        .order("created_at", { ascending: false })
        .limit(limit)
        .or("payload->>hiddenFromList.is.null,payload->>hiddenFromList.eq.false")

      if (q) {
        query = query.ilike("client_name", `%${q}%`)
      }
      if (scope === "project") {
        query = query.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
      } else if (scope === "main") {
        query = query.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
      }

      const result = await query
      if (result.error) {
        return NextResponse.json(
          {
            error: "Failed to fetch invoices",
            details: result.error.message,
            hint: `Ensure table '${INVOICES_TABLE}' exists and RLS policies allow admin reads.`,
          },
          { status: 500 }
        )
      }
      invoices = result.data || []
    }

    // Summary for dashboard cards and list header
    let summaryQuery = supabase.from(INVOICES_TABLE).select("grand_total,payload", { count: "exact" })
    summaryQuery = summaryQuery.or("payload->>hiddenFromList.is.null,payload->>hiddenFromList.eq.false")
    if (q) summaryQuery = summaryQuery.ilike("client_name", `%${q}%`)
    if (scope === "project") {
      summaryQuery = summaryQuery.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
    } else if (scope === "main") {
      summaryQuery = summaryQuery.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
    }
    const summaryResult = await summaryQuery
    const summaryRows = summaryResult.data || []
    const totalAmount = summaryRows.reduce((sum, row) => sum + Number(row.grand_total || 0), 0)
    const totalCount = summaryResult.count || 0
    const totalPaid = summaryRows.reduce((sum, row: any) => {
      const records = row?.payload?.payments?.records
      if (!Array.isArray(records)) return sum
      const rowPaid = records.reduce((acc: number, r: any) => acc + Number(r?.amount || 0), 0)
      return sum + rowPaid
    }, 0)
    const totalDue = Math.max(0, totalAmount - totalPaid)

    return NextResponse.json({
      success: true,
      invoices,
      summary: {
        totalCount,
        totalAmount,
        totalPaid,
        totalDue,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error?.message || "Unknown error" },
      { status: 500 }
    )
  }
}
