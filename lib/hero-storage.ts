import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

export const HERO_IMAGES_BUCKET = 'hero-images'

/**
 * Returns the object path inside the hero-images bucket for a public (or signed) Supabase Storage URL.
 */
export function extractHeroImagesObjectPath(
  imageUrl: string | null | undefined
): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') return null
  const t = imageUrl.trim()
  if (!t.startsWith('http://') && !t.startsWith('https://')) return null
  try {
    const u = new URL(t)
    const publicMarker = '/storage/v1/object/public/hero-images/'
    const signMarker = '/storage/v1/object/sign/hero-images/'
    let idx = u.pathname.indexOf(publicMarker)
    let rel: string | null =
      idx !== -1 ? u.pathname.slice(idx + publicMarker.length) : null
    if (rel === null) {
      idx = u.pathname.indexOf(signMarker)
      if (idx !== -1) rel = u.pathname.slice(idx + signMarker.length)
    }
    if (!rel) return null
    const path = decodeURIComponent(rel)
    if (!path || path.includes('..')) return null
    return path
  } catch {
    return null
  }
}

export async function removeHeroObjectFromBucket(
  supabase: SupabaseClient,
  imageUrl: string | null | undefined
): Promise<void> {
  const path = extractHeroImagesObjectPath(imageUrl)
  if (!path) return
  const { error } = await supabase.storage.from(HERO_IMAGES_BUCKET).remove([path])
  if (error) {
    logger.log('⚠️ hero-images remove:', path, error.message)
  }
}
