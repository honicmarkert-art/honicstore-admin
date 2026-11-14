import { NextRequest, NextResponse } from "next/server"
import { validateAdminAccess, createAdminSupabaseClient } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index)

const MAX_BRIEF = 4000
const MAX_LINES = 40

type DraftLine = {
  section: string
  item: string
  qty: string
  unitPrice: string
}

type InvoiceDraft = {
  clientName: string
  clientAddress: string
  clientEmail: string
  clientPhone: string
  reference: string
  notes: string
  lines: DraftLine[]
}

type CatalogItem = {
  name: string
  price: number
  source: "store" | "invoice"
}

type KnownClient = {
  name: string
  address: string
  email: string
  phone: string
}

type PriceSummary = {
  storePriced: number
  invoicePriced: number
  unpriced: number
  clientFromHistory: boolean
}

function asText(value: unknown, max = 240): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
}

function asQty(value: unknown): string {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "")
  if (!cleaned) return "1"
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return "1"
  return String(n)
}

function asMoney(value: unknown): string {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "")
  if (!cleaned) return ""
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return ""
  return String(n)
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function matchScore(itemName: string, catalogName: string): number {
  const left = normalizeName(itemName)
  const right = normalizeName(catalogName)
  if (!left || !right) return 0
  if (left === right) return 100
  const shorter = Math.min(left.length, right.length)
  if (shorter >= 4 && (left.includes(right) || right.includes(left))) return 80
  const leftTokens = left.split(" ").filter((token) => token.length > 2)
  const rightTokens = right.split(" ").filter((token) => token.length > 2)
  if (!leftTokens.length || !rightTokens.length) return 0
  const rightSet = new Set(rightTokens)
  const shared = leftTokens.filter((token) => rightSet.has(token)).length
  const ratio = shared / Math.max(leftTokens.length, rightTokens.length)
  if (shared >= 2 && ratio >= 0.5) return 60
  return 0
}

function nameFit(catalogName: string, itemName: string): number {
  const name = normalizeName(catalogName)
  const query = normalizeName(itemName)
  let score = 0
  if (query && name.startsWith(query)) score += 4
  else if (query && name.includes(query)) score += 2
  if (name.includes("generic") || name.includes("miscellaneous")) score -= 2
  return score
}

function bestCatalogMatch(itemName: string, catalog: CatalogItem[]): { item: CatalogItem; score: number } | null {
  let best: { item: CatalogItem; score: number; fit: number } | null = null
  for (const item of catalog) {
    const score = matchScore(itemName, item.name)
    if (score < 60) continue
    const fit = nameFit(item.name, itemName)
    const betterScore = !best || score > best.score
    const sameScoreBetterFit = Boolean(best && score === best.score && fit > best.fit)
    const sameFitPreferStore = Boolean(best && score === best.score && fit === best.fit && item.source === "store" && best.item.source !== "store")
    if (betterScore || sameScoreBetterFit || sameFitPreferStore) best = { item, score, fit }
  }
  return best
}

function pricesWrittenByUser(brief: string): Set<number> {
  const found = new Set<number>()
  const marked = brief.match(/(?:at|price|cost|for|tzs|tsh)\s*[: ]*\s*(\d[\d,]*(?:\.\d+)?)/gi) || []
  for (const chunk of marked) {
    const raw = chunk.match(/(\d[\d,]*(?:\.\d+)?)/)?.[1] || ""
    const n = Number(raw.replace(/,/g, ""))
    if (Number.isFinite(n) && n > 0) found.add(n)
  }
  for (const raw of brief.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,}/g) || []) {
    const n = Number(raw.replace(/,/g, ""))
    if (!Number.isFinite(n) || n < 1000 || n > 100000000) continue
    if (!raw.includes(",") && n >= 2020 && n <= 2035) continue
    found.add(n)
  }
  return found
}

function applyKnownPrices(draft: InvoiceDraft, catalog: CatalogItem[], brief: string): PriceSummary {
  const stated = pricesWrittenByUser(brief)
  const summary: PriceSummary = { storePriced: 0, invoicePriced: 0, unpriced: 0, clientFromHistory: false }
  draft.lines = draft.lines.map((line) => {
    const statedPrice = Number(line.unitPrice)
    if (line.unitPrice && stated.has(statedPrice)) return line
    const match = bestCatalogMatch(line.item, catalog)
    if (!match || match.item.price <= 0) {
      summary.unpriced += 1
      return { ...line, unitPrice: "" }
    }
    if (match.item.source === "store") summary.storePriced += 1
    else summary.invoicePriced += 1
    return { ...line, unitPrice: String(match.item.price) }
  })
  return summary
}

const PART_LABELS: Array<{ key: string; test: RegExp; name: string }> = [
  { key: "heatsink", test: /heatsink/, name: "Heatsink" },
  { key: "schottky", test: /schottky|1n5819/, name: "Schottky diode" },
  { key: "mosfet", test: /mosfet/, name: "Power MOSFET" },
  { key: "electrolytic", test: /electrolytic/, name: "Electrolytic capacitor" },
  { key: "ceramic", test: /ceramic capacitor/, name: "Ceramic capacitor" },
  { key: "carbon-film", test: /carbon film/, name: "Carbon film resistor" },
  { key: "metal-film", test: /metal film/, name: "Metal film resistor" },
  { key: "boost-module", test: /xl6009|mt3608|boost converter/, name: "Boost converter module" },
  { key: "buck-module", test: /buck converter|lm2596|lm2695/, name: "Buck converter module" },
  { key: "wire", test: /\b(wire|waya|kebo|cable)\b/, name: "Wire" },
  { key: "capacitor", test: /\b(cap|capacitor|kondenseta|capacitors)\b/, name: "Capacitor" },
  { key: "resistor", test: /\b(res|resistor|resistors|kinga)\b/, name: "Resistor" },
]

function partIdentity(name: string): { key: string; name: string } | null {
  const normalized = normalizeName(name)
  return PART_LABELS.find((entry) => entry.test.test(normalized)) || null
}

function lineIdentity(name: string): string {
  return partIdentity(name)?.key || normalizeName(name)
}

function useStandardNames(draft: InvoiceDraft) {
  const seen = new Set<string>()
  draft.lines = draft.lines.filter((line) => {
    const standard = partIdentity(line.item)
    if (standard) line.item = standard.name
    const key = lineIdentity(line.item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const ASSEMBLY_PARTS: Array<{ test: RegExp; include: Array<{ needle: string; label: string }>; exclude: string[] }> = [
  {
    test: /boost\s*converter/,
    include: [
      { needle: "1n5819", label: "Schottky diode" },
      { needle: "mosfet", label: "Power MOSFET" },
      { needle: "ceramic capacitor", label: "Ceramic capacitor" },
      { needle: "electrolytic capacitor", label: "Electrolytic capacitor" },
      { needle: "carbon film", label: "Carbon film resistor" },
      { needle: "metal film", label: "Metal film resistor" },
    ],
    exclude: ["photo", "ldr", "led", "vga", "hdmi", "zener", "diac", "potentiometer", "buck", "heatsink"],
  },
  {
    test: /buck\s*converter/,
    include: [
      { needle: "lm2596", label: "Buck converter module" },
      { needle: "schottky", label: "Schottky diode" },
      { needle: "electrolytic capacitor", label: "Electrolytic capacitor" },
      { needle: "ceramic capacitor", label: "Ceramic capacitor" },
    ],
    exclude: ["photo", "ldr", "led", "vga", "hdmi", "boost", "step up", "heatsink"],
  },
]

function rankPartMatch(name: string, needle: string): number {
  const normalized = normalizeName(name)
  let score = normalized.startsWith(needle) ? 2 : 0
  if (normalized.includes("generic") || normalized.includes("miscellaneous") || normalized.includes("assorted")) score -= 1
  return score
}

function wantsComponentList(brief: string): boolean {
  return /\b(components?|parts|bill of materials|bom|vipengele|sehem[ua])\b/i.test(brief)
}

const STATED_PARTS: Array<{ test: RegExp; label: string; qtyGroup: number }> = [
  { test: /(\d+)\s*(?:x\s*)?(?:res(?:istor)?s?|kinga)\b/i, label: "Resistor", qtyGroup: 1 },
  { test: /(\d+)\s*(?:x\s*)?(?:cap(?:acitor)?s?|kondenseta)\b/i, label: "Capacitor", qtyGroup: 1 },
  { test: /(?:waya|wire|kebo|cable)(?:\s+\w+){0,2}\s+(\d+)/i, label: "Wire", qtyGroup: 1 },
  { test: /(\d+)\s*(?:mita|m|meter|metres)\s*(?:ya\s+|of\s+)?(?:waya|wire|kebo|cable)/i, label: "Wire", qtyGroup: 1 },
  { test: /(\d+)\s*(?:x\s*)?(?:buck\s*converters?)/i, label: "Buck converter module", qtyGroup: 1 },
  { test: /(\d+)\s*(?:x\s*)?(?:boost\s*converters?)/i, label: "Boost converter module", qtyGroup: 1 },
]

function statedPartRequests(brief: string): Array<{ label: string; qty: string }> {
  const found: Array<{ label: string; qty: string }> = []
  for (const rule of STATED_PARTS) {
    const match = brief.match(rule.test)
    const qty = match?.[rule.qtyGroup]
    if (!qty || found.some((line) => line.label === rule.label)) continue
    found.push({ label: rule.label, qty: String(Number(qty)) })
  }
  if (/buck\s*converter/i.test(brief) && !found.some((line) => line.label === "Buck converter module")) {
    found.unshift({ label: "Buck converter module", qty: "1" })
  }
  if (/boost\s*converter/i.test(brief) && !found.some((line) => line.label === "Boost converter module")) {
    found.unshift({ label: "Boost converter module", qty: "1" })
  }
  return found
}

function mergeStatedParts(draft: InvoiceDraft, requests: Array<{ label: string; qty: string }>) {
  for (const request of requests) {
    const key = lineIdentity(request.label)
    const existing = draft.lines.find((line) => lineIdentity(line.item) === key)
    if (existing) {
      existing.item = request.label
      existing.qty = request.qty
      continue
    }
    draft.lines.push({ section: "electrical", item: request.label, qty: request.qty, unitPrice: "" })
  }
}

function dropUnaskedVariants(draft: InvoiceDraft, brief: string, requests: Array<{ label: string; qty: string }>) {
  const text = brief.toLowerCase()
  const drop = new Set<string>()
  if (requests.some((line) => line.label === "Resistor") && !/carbon film|metal film/.test(text)) {
    drop.add("carbon-film")
    drop.add("metal-film")
  }
  if (requests.some((line) => line.label === "Capacitor") && !/electrolytic|ceramic/.test(text)) {
    drop.add("electrolytic")
    drop.add("ceramic")
  }
  if (!drop.size) return
  draft.lines = draft.lines.filter((line) => !drop.has(lineIdentity(line.item)))
}

function recountPrices(draft: InvoiceDraft, catalog: CatalogItem[]): PriceSummary {
  const summary: PriceSummary = { storePriced: 0, invoicePriced: 0, unpriced: 0, clientFromHistory: false }
  for (const line of draft.lines) {
    const price = Number(line.unitPrice)
    if (!line.unitPrice || !Number.isFinite(price) || price <= 0) {
      summary.unpriced += 1
      continue
    }
    const match = bestCatalogMatch(line.item, catalog)
    if (match?.item.source === "invoice") summary.invoicePriced += 1
    else summary.storePriced += 1
  }
  return summary
}

function expandAssembly(draft: InvoiceDraft, catalog: CatalogItem[], brief: string) {
  if (statedPartRequests(brief).length || !wantsComponentList(brief)) return
  const rule = ASSEMBLY_PARTS.find((entry) => entry.test.test(brief))
  if (!rule) return
  const existing = new Set(draft.lines.map((line) => lineIdentity(line.item)))
  let added = 0
  for (const part of rule.include) {
    const key = lineIdentity(part.label)
    if (existing.has(key)) continue
    const needle = normalizeName(part.needle)
    const item = catalog
      .filter((entry) => {
        const name = normalizeName(entry.name)
        if (!name.includes(needle) || entry.price <= 0) return false
        return !rule.exclude.some((skip) => name.includes(skip))
      })
      .sort((a, b) => rankPartMatch(b.name, needle) - rankPartMatch(a.name, needle))[0]
    if (!item || added >= 12) continue
    existing.add(key)
    draft.lines.push({ section: "electrical", item: part.label, qty: "1", unitPrice: String(item.price) })
    added += 1
  }
}

function mentionsPhrase(text: string, phrase: string): boolean {
  const needle = phrase.toLowerCase().trim()
  if (needle.length < 3) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text)
}

function statedClientDetails(brief: string): { name: string; phone: string; address: string } {
  const phoneMatch = brief.match(/(?:namba ya simu|simu|phone)\s*[:.]?\s*(\+?\d[\d\s-]{7,}\d)/i)
  const phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, "") : ""
  const nameMatch = brief.match(/\b(?:mteja\s+)?anaitwa\s+(.+?)(?=\s+namba\b|\s+simu\b|\s+phone\b|$)/i)
  const name = nameMatch ? nameMatch[1].replace(/\s+/g, " ").trim() : ""
  let address = ""
  if (phoneMatch && phoneMatch.index != null) {
    const after = brief.slice(phoneMatch.index + phoneMatch[0].length).replace(/\s+/g, " ").trim()
    if (after) address = after
  }
  return { name, phone, address }
}

function applyStatedClient(draft: InvoiceDraft, brief: string): boolean {
  const stated = statedClientDetails(brief)
  if (stated.name) draft.clientName = stated.name
  if (stated.phone) {
    draft.clientPhone = stated.phone
    const emailDigits = draft.clientEmail.replace(/[^\d+]/g, "")
    if (!draft.clientEmail.includes("@") && emailDigits === stated.phone) draft.clientEmail = ""
  }
  if (stated.address) draft.clientAddress = stated.address
  return Boolean(stated.name)
}

function applyKnownClient(draft: InvoiceDraft, clients: KnownClient[], brief: string): boolean {
  const text = brief.toLowerCase()
  const known = clients
    .filter((client) => mentionsPhrase(text, client.name))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (known) {
    draft.clientName = known.name
    if (known.address) draft.clientAddress = known.address
    if (known.email) draft.clientEmail = known.email
    if (known.phone) draft.clientPhone = known.phone
    return true
  }
  if (draft.clientName && !mentionsPhrase(text, draft.clientName)) draft.clientName = ""
  if (draft.clientAddress && !mentionsPhrase(text, draft.clientAddress)) draft.clientAddress = ""
  if (draft.clientEmail && !text.includes(draft.clientEmail.toLowerCase())) draft.clientEmail = ""
  if (draft.clientPhone && !text.includes(draft.clientPhone.toLowerCase())) draft.clientPhone = ""
  return false
}

async function loadCatalog(scope: "project" | "main" | "all"): Promise<{ items: CatalogItem[]; clients: KnownClient[] }> {
  let supabase: ReturnType<typeof createAdminSupabaseClient>
  try {
    supabase = createAdminSupabaseClient()
  } catch {
    return { items: [], clients: [] }
  }

  const items: CatalogItem[] = []
  const seen = new Set<string>()

  const products = await supabase.from("products").select("name, price").eq("is_hidden", false).limit(500)
  for (const row of products.data || []) {
    const name = asText(row?.name, 160)
    const price = Number(row?.price)
    const key = normalizeName(name)
    if (!key || !Number.isFinite(price) || price <= 0 || seen.has(key)) continue
    seen.add(key)
    items.push({ name, price, source: "store" })
  }

  let invoiceQuery = supabase
    .from("invoices")
    .select("created_at, client_name, payload")
    .order("created_at", { ascending: false })
    .limit(400)
  if (scope === "project") invoiceQuery = invoiceQuery.or("payload->>dashboardScope.eq.project,payload->>dashboardScope.is.null")
  if (scope === "main") invoiceQuery = invoiceQuery.or("payload->>dashboardScope.eq.main,payload->>dashboardScope.is.null")
  const invoices = await invoiceQuery

  const clients: KnownClient[] = []
  const clientSeen = new Set<string>()
  for (const row of invoices.data || []) {
    const payload = (row?.payload || {}) as Record<string, any>
    const clientName = asText(payload.clientName || row?.client_name, 160)
    const clientKey = clientName.toLowerCase()
    if (clientName && !clientSeen.has(clientKey) && clients.length < 40) {
      clientSeen.add(clientKey)
      clients.push({
        name: clientName,
        address: asText(payload.clientAddress, 300),
        email: asText(payload.clientEmail, 160),
        phone: asText(payload.clientPhone, 40),
      })
    }
    const rows: Array<{ name: string; price: number }> = []
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) rows.push({ name: asText(item?.description, 160), price: Number(String(item?.unitPrice || "").replace(/[^0-9.]/g, "")) })
    }
    const sections = payload.projectTables?.sections
    if (Array.isArray(sections)) {
      for (const section of sections) {
        for (const line of section?.rows || []) {
          if (!line || typeof line !== "object") continue
          rows.push({ name: asText(line.item, 160), price: Number(String(line.unitPrice || "").replace(/[^0-9.]/g, "")) })
        }
      }
    }
    for (const line of rows) {
      const key = normalizeName(line.name)
      if (!key || /^e g /.test(key) || seen.has(`invoice:${key}`) || !Number.isFinite(line.price) || line.price <= 0) continue
      seen.add(`invoice:${key}`)
      if (items.filter((item) => item.source === "invoice").length >= 250) continue
      items.push({ name: line.name, price: line.price, source: "invoice" })
    }
  }

  return { items, clients }
}

function catalogPrompt(items: CatalogItem[], clients: KnownClient[]): string {
  const store = items.filter((item) => item.source === "store").slice(0, 350)
  const past = items.filter((item) => item.source === "invoice").slice(0, 200)
  const lines = [
    "STORE PRODUCTS. Use these names and copy the price exactly when the part fits the request:",
    store.length ? store.map((item) => `${item.name} | ${item.price}`).join("\n") : "(none)",
    "PAST INVOICE PRICES. Use only when the same item is not in the store list:",
    past.length ? past.map((item) => `${item.name} | ${item.price}`).join("\n") : "(none)",
    "KNOWN CLIENTS. Use address, email, and phone only when the request names that client:",
    clients.length ? clients.map((client) => [client.name, client.address, client.email, client.phone].filter(Boolean).join(" | ")).join("\n") : "(none)",
  ]
  return lines.join("\n")
}

function parseDraft(raw: string): InvoiceDraft {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("Gemini did not return invoice fields")
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  const linesRaw = Array.isArray(parsed.lines) ? parsed.lines : []
  const lines: DraftLine[] = []
  for (const row of linesRaw) {
    if (!row || typeof row !== "object") continue
    const item = asText((row as Record<string, unknown>).item, 180)
    if (!item) continue
    lines.push({
      section: asText((row as Record<string, unknown>).section, 80).toLowerCase(),
      item,
      qty: asQty((row as Record<string, unknown>).qty),
      unitPrice: asMoney((row as Record<string, unknown>).unitPrice),
    })
    if (lines.length >= MAX_LINES) break
  }
  return {
    clientName: asText(parsed.clientName, 160),
    clientAddress: asText(parsed.clientAddress, 300),
    clientEmail: asText(parsed.clientEmail, 160),
    clientPhone: asText(parsed.clientPhone, 40),
    reference: asText(parsed.reference, 80),
    notes: asText(parsed.notes, 1200),
    lines,
  }
}

async function generateDraft(
  model: string,
  key: string,
  prompt: string,
  jsonMode: boolean
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 2048,
  }
  if (jsonMode) generationConfig.responseMimeType = "application/json"
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(45000),
    }
  )
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; status?: string }
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  } | null
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: body?.error?.message || "Gemini request failed",
    }
  }
  const text = (body?.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim()
  if (!text) return { ok: false, status: 502, message: "Gemini returned an empty draft" }
  return { ok: true, text }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const key = process.env.GEMINI_API_KEY?.trim()
    if (!key) {
      return NextResponse.json({ error: "Gemini is not configured on the server" }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const brief = String(body?.brief || "").trim()
    if (brief.length < 8) {
      return NextResponse.json({ error: "Describe the client and the items to put on the invoice" }, { status: 400 })
    }
    if (brief.length > MAX_BRIEF) {
      return NextResponse.json({ error: "That description is too long" }, { status: 400 })
    }

    const documentKind = ["invoice", "quotation", "delivery_note"].includes(body?.documentKind)
      ? body.documentKind
      : "invoice"
    const sectionTitles = Array.isArray(body?.sections)
      ? body.sections.map((title: unknown) => asText(title, 120)).filter(Boolean).slice(0, 8)
      : []
    const scope: "project" | "main" | "all" =
      body?.dashboardScope === "project" ? "project" : body?.dashboardScope === "main" ? "main" : "all"
    const catalog = await loadCatalog(scope)

    const prompt = [
      "You prepare a Honic Company Limited invoice in Tanzanian shillings.",
      "The description may be English or Swahili. Understand both.",
      "Swahili examples: 'niandikie invoice' means write an invoice. 'res' means resistor. 'cap' means capacitor. 'waya' or 'wire mita 10' means 10 meters of wire.",
      "'mteja anaitwa Omary Abdala' means the client name is Omary Abdala. 'namba ya simu' is the phone number, not the email. Words after the phone, such as Arusha tech, are the client address.",
      "Do not replace the named client with a different saved client. Omary is not Mary.",
      "A number written before a part is the quantity. '10 res 10 cap na wire mita 10' means one Resistor line qty 10, one Capacitor line qty 10, and one Wire line qty 10.",
      "When the person writes res or resistor, use one line named Resistor. Do not also add Carbon film resistor or Metal film resistor.",
      "When the person writes cap or capacitor, use one line named Capacitor. Do not also add Electrolytic capacitor or Ceramic capacitor.",
      "When the person lists the parts and quantities, use only those parts. Do not add extra parts.",
      "When the request says components or parts, and does not list quantities, list the separate pieces that build that circuit. Do not stop at one finished module.",
      "Example: 'boost converter components' means a boost converter module, power MOSFET, Schottky diode, capacitors, and resistors.",
      "Write a short standard name for each part, such as Boost converter module, Power MOSFET, Schottky diode, Electrolytic capacitor, Ceramic capacitor, or Carbon film resistor.",
      "Do not copy the long store title. One line per part. Do not repeat the same part.",
      "Return JSON only with this shape:",
      '{"clientName":"","clientAddress":"","clientEmail":"","clientPhone":"","reference":"","notes":"","lines":[{"section":"electrical","item":"","qty":"1","unitPrice":""}]}',
      "section must be one of: electrical, prototype, service, items.",
      "electrical = components, boards, sensors, pumps, cables, modules.",
      "prototype = casings, tanks, and built hardware.",
      "service = installation, testing, labour, transport.",
      "items = a simple invoice that has no project sections.",
      "Use a standard part name even when the store title is longer. The price still has to come from the store or a past invoice.",
      "If the store has no match, use the price from a past invoice and keep the standard name.",
      "If the user typed a price, use the user's price.",
      "If neither list has the item and the user gave no price, include the item and leave unitPrice empty. Never invent a price, email, phone, or address.",
      "Use a known client only when the description names that client.",
      "qty is a number. Use 1 when a quantity is not given. Keep the list to the parts that belong to the request, at most 25 lines.",
      "notes stays empty unless the description asks for a special term.",
      `Document type: ${documentKind}.`,
      sectionTitles.length ? `Project sections: ${sectionTitles.join(" | ")}.` : "No project sections.",
      catalogPrompt(catalog.items, catalog.clients),
      `Description:\n${brief}`,
    ].join("\n")

    let lastMessage = "Gemini request failed"
    for (const model of MODELS) {
      let result = await generateDraft(model, key, prompt, true)
      if (!result.ok && result.status === 400) result = await generateDraft(model, key, prompt, false)
      if (result.ok) {
        const draft = parseDraft(result.text)
        const stated = statedPartRequests(brief)
        if (stated.length) mergeStatedParts(draft, stated)
        applyKnownPrices(draft, catalog.items, brief)
        useStandardNames(draft)
        if (stated.length) dropUnaskedVariants(draft, brief, stated)
        expandAssembly(draft, catalog.items, brief)
        const summary = recountPrices(draft, catalog.items)
        const fromHistory = applyKnownClient(draft, catalog.clients, brief)
        const namedInBrief = applyStatedClient(draft, brief)
        summary.clientFromHistory = fromHistory && !namedInBrief
        if (!draft.lines.length && !draft.clientName) {
          return NextResponse.json({ error: "Gemini could not find items or a client in that description" }, { status: 422 })
        }
        return NextResponse.json({ draft, summary })
      }
      lastMessage = result.message
      if (result.status !== 404 && result.status !== 400) break
    }

    return NextResponse.json({ error: lastMessage }, { status: 502 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare the invoice"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
