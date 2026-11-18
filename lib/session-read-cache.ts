const TTL_MS = 120_000

type Entry = { at: number; value: unknown }

export function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry
    if (!entry || Date.now() - Number(entry.at || 0) > TTL_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    return entry.value as T
  } catch {
    return null
  }
}

export function writeSessionCache(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    const raw = JSON.stringify({ at: Date.now(), value })
    if (raw.length > 400_000) return
    sessionStorage.setItem(key, raw)
  } catch {
    // The page still works if the browser refuses more session storage.
  }
}
