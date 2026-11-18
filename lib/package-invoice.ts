export type PackageBlock = {
  id: string
  kind: "package" | "charge"
  name: string
  offers: string[]
  quantity: number
  unitPrice: number
}

type PackageItem = {
  id?: string
  kind?: string
  name?: string
  description?: string
  offers?: unknown
  quantity?: number
  unitPrice?: number
}

export function isPackagePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const record = payload as {
    documentKind?: string
    invoiceLayout?: string
    itemsTableTitle?: string
    items?: PackageItem[]
  }
  const kind = String(record.documentKind || "invoice")
  if (kind === "delivery_note" || kind === "technical_report" || kind === "quotation") return false
  if (record.invoiceLayout === "package") return true
  if (String(record.itemsTableTitle || "").toLowerCase().includes("package")) return true
  const items = Array.isArray(record.items) ? record.items : []
  return items.some((item) => /^package\s+\d+/i.test(String(item?.description || item?.name || "")))
}

function splitPackageTitle(description: string): { name: string; offer: string } {
  const text = description.trim()
  const patterns = [/\s+—\s+/, /\s+–\s+/, /\s+-\s+/, /\.\.\s*/]
  for (const pattern of patterns) {
    const parts = text.split(pattern).map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1 && /^package\s+\d+/i.test(parts[0])) {
      return { name: parts[0], offer: parts.slice(1).join(", ") }
    }
  }
  return { name: text, offer: "" }
}

export function emptyPackageBlock(kind: PackageBlock["kind"] = "package"): PackageBlock {
  return {
    id: `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: "",
    offers: kind === "package" ? [""] : [],
    quantity: 1,
    unitPrice: 0,
  }
}

export function blocksFromItems(items: unknown): PackageBlock[] {
  const rows = Array.isArray(items) ? (items as PackageItem[]) : []
  if (!rows.length) return [emptyPackageBlock("package")]
  return rows.map((item, index) => {
    const description = String(item?.description || "").trim()
    const split = splitPackageTitle(description || String(item?.name || ""))
    const explicitName = String(item?.name || "").trim()
    const explicitOffers = Array.isArray(item?.offers)
      ? item.offers.map((offer) => String(offer || "").trim()).filter(Boolean)
      : []
    const detectedPackage = /^package\s+\d+/i.test(explicitName || split.name)
    const kind: PackageBlock["kind"] =
      item?.kind === "charge" || item?.kind === "package" ? item.kind : detectedPackage ? "package" : "charge"
    const name =
      kind === "package"
        ? explicitName || split.name || `Package ${index + 1}`
        : explicitName || description
    const offers = kind === "package" ? (explicitOffers.length ? explicitOffers : split.offer ? [split.offer] : []) : []
    const quantityValue = Number(item?.quantity)
    const priceValue = Number(item?.unitPrice)
    return {
      id: String(item?.id || `pkg-${index + 1}`),
      kind,
      name,
      offers,
      quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1,
      unitPrice: Number.isFinite(priceValue) ? priceValue : 0,
    }
  })
}

export function itemsFromBlocks(blocks: PackageBlock[]) {
  return blocks.map((block) => {
    const offers = block.kind === "package" ? block.offers.map((offer) => offer.trim()).filter(Boolean) : []
    const name = block.name.trim()
    const description = block.kind === "package" && offers.length ? `${name} — ${offers.join("; ")}` : name
    return {
      id: block.id,
      kind: block.kind,
      name,
      offers,
      description,
      quantity: block.quantity,
      unitPrice: block.unitPrice,
    }
  })
}

export function lineAmount(block: PackageBlock): number {
  const amount = (Number(block.quantity) || 0) * (Number(block.unitPrice) || 0)
  return Number.isFinite(amount) ? amount : 0
}
