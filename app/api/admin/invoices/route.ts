import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"
import { parseProjectYear, projectYearOrFilter, recordInProjectYear } from "@/lib/project-year"
import { generateNextInvoiceNumber, nextReferences, referenceForCategory } from "@/lib/invoice-sequence"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
const INVOICES_TABLE = "invoices"

const saveInvoiceSchema = z.object({
  invoiceId: z.string().min(1).optional(),
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

    if (invoice.invoiceId) {
      const { data: existing, error: existingError } = await supabase
        .from(INVOICES_TABLE)
        .select("id, invoice_number, created_by")
        .eq("id", invoice.invoiceId)
        .single()
      if (existingError || !existing) {
        return NextResponse.json({ error: "Invoice not found for update", details: existingError?.message }, { status: 404 })
      }

      const now = new Date().toISOString()
      const fixedInvoiceNumber = String(existing.invoice_number || invoice.invoiceNumber || "").trim()
      const referenceNumber = await referenceForCategory(supabase, String(body?.projectCategory || ""), String(body?.referenceNumber || ""))
      const updateRecord = {
        invoice_number: fixedInvoiceNumber,
        client_name: clientName,
        issue_date: invoice.issueDate || null,
        due_date: invoice.dueDate || null,
        currency: invoice.currency || "TZS",
        subtotal: invoice.totals.subtotal,
        tax_amount: invoice.totals.taxAmount,
        grand_total: invoice.totals.grandTotal,
        created_by: existing.created_by || user?.id || null,
        payload: { ...body, referenceNumber, dashboardScope: invoice.dashboardScope, invoiceNumber: fixedInvoiceNumber },
        updated_at: now,
      }
      const updateResult = await supabase
        .from(INVOICES_TABLE)
        .update(updateRecord)
        .eq("id", invoice.invoiceId)
        .select()
        .single()
      if (updateResult.error) {
        return NextResponse.json(
          {
            error: "Failed to update invoice",
            details: updateResult.error.message,
            hint: `Ensure table '${INVOICES_TABLE}' exists and matches the migration schema.`,
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ success: true, invoice: updateResult.data })
    }

    const documentKind = String(body?.documentKind || "invoice")
    const referenceNumber = await referenceForCategory(supabase, String(body?.projectCategory || ""), "")
    body.referenceNumber = referenceNumber

    let insertResult: any = null
    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date().toISOString()
      const generatedInvoiceNumber = await generateNextInvoiceNumber(supabase, documentKind, clientName)
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
        payload: {
          ...body,
          documentKind,
          dashboardScope: invoice.dashboardScope,
          invoiceNumber: generatedInvoiceNumber,
          reportNumber: documentKind === "technical_report" ? generatedInvoiceNumber : body?.reportNumber,
        },
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

    const nextNumberKind = String(request.nextUrl.searchParams.get("nextNumber") || "").trim()
    if (["invoice", "quotation", "delivery_note", "technical_report"].includes(nextNumberKind)) {
      const clientName = String(request.nextUrl.searchParams.get("clientName") || "")
      const invoiceNumber = await generateNextInvoiceNumber(supabase, nextNumberKind, clientName)
      return NextResponse.json({ success: true, invoiceNumber })
    }

    if (request.nextUrl.searchParams.get("nextReferences") === "1") {
      const references = await nextReferences(supabase)
      return NextResponse.json({ success: true, references })
    }

    const nextReferenceCategory = String(request.nextUrl.searchParams.get("nextReference") || "").trim()
    if (["fyp", "side", "research"].includes(nextReferenceCategory)) {
      const referenceNumber = await referenceForCategory(supabase, nextReferenceCategory, "")
      return NextResponse.json({ success: true, referenceNumber })
    }

    const invoiceNumberLookup = String(request.nextUrl.searchParams.get("invoiceNumber") || "").trim()
    if (invoiceNumberLookup) {
      const { data, error } = await supabase
        .from(INVOICES_TABLE)
        .select("*")
        .eq("invoice_number", invoiceNumberLookup)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        return NextResponse.json({ error: "Failed to fetch source document", details: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, invoice: data || null })
    }

    const q = String(request.nextUrl.searchParams.get("clientName") || "").trim()
    const scope = request.nextUrl.searchParams.get("scope") === "project" ? "project" : "main"
    const summaryOnly = request.nextUrl.searchParams.get("summaryOnly") === "true"
    const year = parseProjectYear(request.nextUrl.searchParams.get("year"))
    const limit = Math.min(year ? 1000 : 100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)))
    const documentKindParam = String(request.nextUrl.searchParams.get("documentKind") || "").trim()
    const documentKind =
      documentKindParam === "invoice" ||
      documentKindParam === "quotation" ||
      documentKindParam === "delivery_note" ||
      documentKindParam === "technical_report"
        ? documentKindParam
        : null

    let invoices: any[] = []
    if (!summaryOnly) {
      let query = supabase
        .from(INVOICES_TABLE)
        .select("id, invoice_number, client_name, issue_date, due_date, currency, grand_total, created_at, payload")
        .order("created_at", { ascending: false })
        .limit(limit)
        .or("payload->>usageTrackingRecord.is.null,payload->>usageTrackingRecord.eq.false")

      if (q) {
        query = query.ilike("client_name", `%${q}%`)
      }
      if (scope === "project") {
        query = query.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
      } else if (scope === "main") {
        query = query.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
      }
      if (documentKind) {
        query = query.or(`payload->>documentKind.eq.${documentKind}`)
      } else {
        query = query.or(
          "payload->>documentKind.is.null,payload->>documentKind.eq.invoice,payload->>documentKind.eq.quotation"
        )
        // Exclude delivery notes and technical reports from default invoice list.
      }
      if (year) query = query.or(projectYearOrFilter(year))

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
      invoices = (result.data || []).filter((row: any) => !year || recordInProjectYear(row, year)).map((row: any) => {
        const records = row?.payload?.payments?.records
        const paidTotal = Array.isArray(records)
          ? records.reduce((acc: number, r: any) => acc + Number(r?.amount || 0), 0)
          : 0
        const grand = Number(row?.grand_total || 0)
        const totalPaid = Math.max(0, Math.min(grand, paidTotal))
        const totalDue = Math.max(0, grand - totalPaid)
        return {
          ...row,
          hiddenFromList: Boolean(row?.payload?.hiddenFromList),
          total_paid: totalPaid,
          total_due: totalDue,
        }
      })
    }

    // Summary for dashboard cards and list header
    let summaryQuery = supabase.from(INVOICES_TABLE).select("grand_total,issue_date,created_at,payload", { count: "exact" })
    summaryQuery = summaryQuery
      .or("payload->>usageTrackingRecord.is.null,payload->>usageTrackingRecord.eq.false")
      .or("payload->>hiddenFromList.is.null,payload->>hiddenFromList.eq.false")
    if (q) summaryQuery = summaryQuery.ilike("client_name", `%${q}%`)
    if (scope === "project") {
      summaryQuery = summaryQuery.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
    } else if (scope === "main") {
      summaryQuery = summaryQuery.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
    }
    if (documentKind) {
      summaryQuery = summaryQuery.or(`payload->>documentKind.eq.${documentKind}`)
    } else {
      summaryQuery = summaryQuery.or(
        "payload->>documentKind.is.null,payload->>documentKind.eq.invoice,payload->>documentKind.eq.quotation"
      )
    }
    if (year) summaryQuery = summaryQuery.or(projectYearOrFilter(year))
    const summaryResult = await summaryQuery
    const summaryRows = (summaryResult.data || []).filter((row: any) => !year || recordInProjectYear(row, year))
    const totalAmount = summaryRows.reduce((sum, row) => sum + Number(row.grand_total || 0), 0)
    const totalCount = year ? summaryRows.length : summaryResult.count || summaryRows.length
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
