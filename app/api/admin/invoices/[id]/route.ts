import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
const INVOICES_TABLE = "invoices"

const patchSchema = z.object({
  invoiceNumber: z.string().optional(),
  clientName: z.string().optional(),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  grandTotal: z.coerce.number().nonnegative().optional(),
  paymentNote: z.string().optional(),
  paymentEntry: z
    .object({
      date: z.string().min(1),
      amount: z.coerce.number().positive(),
      note: z.string().optional(),
    })
    .optional(),
})

function getAdminClient() {
  try {
    return { client: createAdminSupabaseClient(), error: null as string | null }
  } catch (error: any) {
    return { client: null as any, error: error?.message || "Failed to create admin client" }
  }
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError
    const { id } = await context.params
    const { client: supabase, error: envError } = getAdminClient()
    if (envError) return NextResponse.json({ error: envError }, { status: 500 })

    const { data, error } = await supabase.from(INVOICES_TABLE).select("*").eq("id", id).single()
    if (error) return NextResponse.json({ error: "Invoice not found", details: error.message }, { status: 404 })
    return NextResponse.json({ success: true, invoice: data })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError
    const { id } = await context.params
    const { client: supabase, error: envError } = getAdminClient()
    if (envError) return NextResponse.json({ error: envError }, { status: 500 })

    const raw = await request.json()
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 })
    }
    const patch = parsed.data

    const { data: current, error: currentError } = await supabase
      .from(INVOICES_TABLE)
      .select("payload, grand_total")
      .eq("id", id)
      .single()
    if (currentError) return NextResponse.json({ error: "Invoice not found", details: currentError.message }, { status: 404 })

    const currentPayload = (current?.payload || {}) as Record<string, any>
    const payments = currentPayload.payments || { records: [], note: "" }
    const records = Array.isArray(payments.records) ? payments.records : []
    if (patch.paymentEntry) {
      records.push({
        id: `${Date.now()}-${records.length}`,
        date: patch.paymentEntry.date,
        amount: patch.paymentEntry.amount,
        note: patch.paymentEntry.note || "",
      })
    }
    const nextPayload = {
      ...currentPayload,
      invoiceNumber: patch.invoiceNumber ?? currentPayload.invoiceNumber,
      clientName: patch.clientName ?? currentPayload.clientName,
      issueDate: patch.issueDate ?? currentPayload.issueDate,
      dueDate: patch.dueDate ?? currentPayload.dueDate,
      totals: {
        ...(currentPayload.totals || {}),
        grandTotal: patch.grandTotal ?? currentPayload?.totals?.grandTotal ?? current?.grand_total ?? 0,
      },
      payments: {
        records,
        note: patch.paymentNote ?? payments.note ?? "",
      },
    }

    const update: Record<string, any> = {
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    }
    if (patch.invoiceNumber !== undefined) update.invoice_number = patch.invoiceNumber
    if (patch.clientName !== undefined) update.client_name = patch.clientName
    if (patch.issueDate !== undefined) update.issue_date = patch.issueDate || null
    if (patch.dueDate !== undefined) update.due_date = patch.dueDate || null
    if (patch.grandTotal !== undefined) update.grand_total = patch.grandTotal

    const { data, error } = await supabase.from(INVOICES_TABLE).update(update).eq("id", id).select("*").single()
    if (error) return NextResponse.json({ error: "Failed to update invoice", details: error.message }, { status: 500 })
    return NextResponse.json({ success: true, invoice: data })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError
    const { id } = await context.params
    const { client: supabase, error: envError } = getAdminClient()
    if (envError) return NextResponse.json({ error: envError }, { status: 500 })

    const { error } = await supabase.from(INVOICES_TABLE).delete().eq("id", id)
    if (error) return NextResponse.json({ error: "Failed to delete invoice", details: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error", details: error?.message || "Unknown error" }, { status: 500 })
  }
}

