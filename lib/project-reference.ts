import { currentProjectYear } from "@/lib/project-year"

const CATEGORY_CODES: Record<string, string> = {
  fyp: "FYP",
  side: "SIDE",
  research: "RES",
}

export function categoryReferenceCode(category: string): string {
  return CATEGORY_CODES[category] || ""
}

export function isAutoCategoryReference(value: string): boolean {
  return /^(FYP|SIDE|RES)-\d{4}-\d{4}$/.test(String(value || "").trim())
}

export function referenceMatchesCategory(value: string, category: string, year = currentProjectYear()): boolean {
  const code = categoryReferenceCode(category)
  if (!code) return false
  return new RegExp(`^${code}-${year}-\\d{4}$`).test(String(value || "").trim())
}

export function nextCategoryReference(category: string, existing: string[], year = currentProjectYear()): string {
  const code = categoryReferenceCode(category)
  if (!code) return ""
  const pattern = new RegExp(`^${code}-${year}-(\\d+)$`)
  const max = existing.reduce((highest, value) => {
    const match = String(value || "").trim().match(pattern)
    const number = match ? Number(match[1]) : 0
    return Number.isFinite(number) ? Math.max(highest, number) : highest
  }, 0)
  return `${code}-${year}-${String(max + 1).padStart(4, "0")}`
}
