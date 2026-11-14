export function currentProjectYear(now = new Date()): number {
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

export function projectYearOptions(now = new Date()): number[] {
  const current = currentProjectYear(now)
  const years: number[] = []
  for (let year = current + 1; year >= 2020; year -= 1) years.push(year)
  return years
}

export function projectYearRange(year: number): { start: string; end: string } {
  return { start: `${year}-09-01`, end: `${year + 1}-10-31` }
}

export function projectYearSpan(year: number): string {
  return `${year} – ${year + 1}`
}

export function projectYearLabel(year: number): string {
  const { start, end } = projectYearRange(year)
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function dayKey(value: unknown): string | null {
  const raw = String(value || "").trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const local = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (local) {
    const day = Number(local[1])
    const month = Number(local[2])
    let year = Number(local[3])
    if (year < 100) year += 2000
    if (!day || !month || !year) return null
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`
}

export function inProjectYear(value: unknown, year: number): boolean {
  const key = dayKey(value)
  if (!key || !Number.isInteger(year)) return false
  const { start, end } = projectYearRange(year)
  return key >= start && key <= end
}

export function projectYearOrFilter(year: number): string {
  const { start, end } = projectYearRange(year)
  const startAt = `${start}T00:00:00.000Z`
  const endAt = `${end}T23:59:59.999Z`
  return [
    `and(issue_date.gte.${start},issue_date.lte.${endAt})`,
    `and(issue_date.is.null,created_at.gte.${startAt},created_at.lte.${endAt})`,
    `and(payload->>issueDate.gte.${start},payload->>issueDate.lte.${end})`,
  ].join(",")
}

export function recordInProjectYear(
  record: { issue_date?: unknown; created_at?: unknown; payload?: { issueDate?: unknown } },
  year: number
): boolean {
  const issue = record.issue_date || record.payload?.issueDate
  if (issue) return inProjectYear(issue, year)
  return inProjectYear(record.created_at, year)
}

export function parseProjectYear(value: unknown): number | null {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  return year
}
