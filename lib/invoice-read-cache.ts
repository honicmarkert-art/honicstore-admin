type Entry = { at: number; value: unknown }

const hits = new Map<string, Entry>()
const TTL_MS = 20_000
const MAX = 40

export function readInvoiceCache<T>(key: string): T | null {
  const hit = hits.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    hits.delete(key)
    return null
  }
  return hit.value as T
}

export function writeInvoiceCache(key: string, value: unknown) {
  hits.set(key, { at: Date.now(), value })
  if (hits.size <= MAX) return
  const oldest = hits.keys().next().value
  if (oldest) hits.delete(oldest)
}

export function clearInvoiceReadCache() {
  hits.clear()
}

export function invoiceCacheKey(url: URL): string {
  const params = new URLSearchParams(url.searchParams)
  params.delete("t")
  const query = params.toString()
  return `${url.pathname}?${query}`
}
