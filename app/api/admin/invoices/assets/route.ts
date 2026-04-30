import { NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient, validateAdminAccess } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_BUCKET = "invoice-assets"

function getBucketName() {
  return process.env.SUPABASE_INVOICE_ASSETS_BUCKET || DEFAULT_BUCKET
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await validateAdminAccess()
    if (authError) return authError

    const supabase = createAdminSupabaseClient()
    const bucket = getBucketName()

    const body = await request.json()
    const kind = String(body?.kind || "asset")
    const filename = String(body?.filename || "asset.png")
    const dataUrl = String(body?.dataUrl || "")
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) {
      return NextResponse.json({ error: "Invalid image payload" }, { status: 400 })
    }

    // Ensure bucket exists (idempotent).
    const bucketInfo = await supabase.storage.getBucket(bucket)
    if (bucketInfo.error) {
      await supabase.storage.createBucket(bucket, { public: true })
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "png"
    const path = `invoices/${user?.id || "admin"}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const upload = await supabase.storage.from(bucket).upload(path, parsed.buffer, {
      contentType: parsed.mime,
      upsert: false,
    })
    if (upload.error) {
      return NextResponse.json({ error: "Upload failed", details: upload.error.message }, { status: 500 })
    }

    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
    return NextResponse.json({ success: true, bucket, path, url: publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: "Internal server error", details: e?.message || "Unknown error" }, { status: 500 })
  }
}

