import { categoryReferenceCode, nextCategoryReference, referenceMatchesCategory } from "@/lib/project-reference"
import { currentProjectYear } from "@/lib/project-year"

const INVOICES_TABLE = "invoices"

type SupabaseQuery = {
  from: (table: string) => {
    select: (columns: string) => any
  }
}

export function invoiceNumberSeries(documentKind: string | undefined, year: number, clientName = ""): { pattern: RegExp; prefix: string; format: (value: string) => string } {
  if (documentKind === "technical_report") {
    const prefix = `TR-${year}-`
    return { pattern: new RegExp(`^TR-${year}-(\\d+)$`), prefix, format: (value) => `${prefix}${value}` }
  }
  if (documentKind === "quotation") {
    const prefix = `QT-${year}-`
    return { pattern: new RegExp(`^QT-${year}-(\\d+)$`), prefix, format: (value) => `${prefix}${value}` }
  }
  if (documentKind === "delivery_note") {
    const prefix = `DN-${year}-`
    return { pattern: new RegExp(`^DN-${year}-(\\d+)$`), prefix, format: (value) => `${prefix}${value}` }
  }
  const initials = clientInitials(clientName)
  const mark = initials ? `${initials}-HCIR` : "HCIR"
  // Pattern matches INV-year-initials-HCIR-number, but we search all invoices globally
  const prefix = `INV-${year}-${mark}-`
  return {
    // Pattern allows optional client initials: INV-yyyy-[initials]-HCIR-nnnn or INV-yyyy-HCIR-nnnn
    // Use non-capturing group for initials so capture group 1 is always the number
    pattern: new RegExp(`^INV-${year}-(?:.*-)?HCIR-(\\d+)$`),
    prefix,
    format: (value) => `${prefix}${value}`
  }
}

export function clientInitials(name: string): string {
  const skip = new Set(["of", "and", "the", "for", "a", "an"])
  const letters = String(name || "")
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word && !skip.has(word.toLowerCase()))
    .map((word) => word[0].toUpperCase())
  return letters.join("").slice(0, 4)
}

export function sameClientName(left: string, right: string): boolean {
  const normalize = (value: string) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase()
  return normalize(left) === normalize(right)
}

function nextFromMatches(values: string[], pattern: RegExp, format: (value: string) => string): string {
  const maxNum = values.reduce((max, value) => {
    const match = String(value || "").trim().match(pattern)
    const number = match ? Number(match[1]) : 0
    return Number.isFinite(number) ? Math.max(max, number) : max
  }, 0)
  return format(String(maxNum + 1).padStart(4, "0"))
}

export async function generateNextInvoiceNumber(supabase: SupabaseQuery, documentKind?: string, clientName = ""): Promise<string> {
  const year = new Date().getFullYear()
  const series = invoiceNumberSeries(documentKind, year, clientName)
  const { data, error } = await supabase
    .from(INVOICES_TABLE)
    .select("invoice_number")
    .like("invoice_number", `${series.prefix}%`)
    .limit(400)
  if (error) throw new Error(error.message)
  const numbers = (data || []).map((row: { invoice_number?: string }) => String(row?.invoice_number || ""))
  return nextFromMatches(numbers, series.pattern, series.format)
}

async function referencesForPrefix(supabase: SupabaseQuery, prefix: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(INVOICES_TABLE)
    .select("payload")
    .or(`payload->>referenceNumber.like.${prefix}*`)
    .limit(400)
  if (error) throw new Error(error.message)
  return (data || [])
    .map((row: { payload?: { referenceNumber?: string } }) => String(row?.payload?.referenceNumber || "").trim())
    .filter(Boolean)
}

export async function referenceForCategory(supabase: SupabaseQuery, category: string, currentReference: string, ignoreReference = ""): Promise<string> {
  const categoryId = String(category || "")
  const code = categoryReferenceCode(categoryId)
  if (!code) return ""
  const current = String(currentReference || "").trim()
  const year = currentProjectYear()
  if (current && referenceMatchesCategory(current, categoryId, year) && current !== ignoreReference) return current
  const existing = await referencesForPrefix(supabase, `${code}-${year}-`)
  return nextCategoryReference(categoryId, existing.filter((value) => value !== ignoreReference), year)
}

export async function nextReferences(supabase: SupabaseQuery): Promise<Record<"fyp" | "side" | "research", string>> {
  const [fyp, side, research] = await Promise.all([
    referenceForCategory(supabase, "fyp", ""),
    referenceForCategory(supabase, "side", ""),
    referenceForCategory(supabase, "research", ""),
  ])
  return { fyp, side, research }
}
