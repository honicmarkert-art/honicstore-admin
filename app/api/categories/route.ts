import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseCredentials } from '@/lib/supabase-server-utils'
import { enhancedRateLimit } from '@/lib/enhanced-rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FALLBACK_CATEGORIES = [
  { id: 'diy-electronic-components', name: 'DIY Electronic Components', slug: 'diy-electronic-components', product_count: 0, is_main: true },
  { id: 'home-electronic-devices', name: 'Home Electronic Devices', slug: 'home-electronic-devices', product_count: 0, is_main: true },
  { id: 'home-office-furnitures', name: 'Home & Office furnitures', slug: 'home-office-furnitures', product_count: 0, is_main: true },
  { id: 'training-kits-school-items', name: 'Training kits & School Items', slug: 'training-kits-school-items', product_count: 0, is_main: true },
]

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = enhancedRateLimit(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: rateLimitResult.reason || 'Too many requests' },
        { status: 429, headers: { 'Retry-After': rateLimitResult.retryAfter?.toString() || '60' } }
      )
    }

    const { url, anonKey } = getSupabaseCredentials()
    const supabase = createClient(url, anonKey)

    let data: any[] | null = null
    let error: any = null

    const res = await supabase
      .from('categories')
      .select(`
        id,
        name,
        slug,
        image_url,
        is_active,
        display_order,
        parent_id,
        parent:parent_id(name, slug)
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    data = res.data
    error = res.error

    if (error) {
      const msg = String(error?.message || '')
      if (msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('getaddrinfo')) {
        return NextResponse.json({
          success: true,
          categories: FALLBACK_CATEGORIES,
          names: FALLBACK_CATEGORIES.map(c => c.name),
          count: FALLBACK_CATEGORIES.length,
          fallback: true
        })
      }
      logger.error('Failed to fetch categories:', error)
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
    }

    const categories = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug || (c.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      image_url: c.image_url || null,
      parent_id: c.parent_id,
      parent_name: Array.isArray(c.parent) ? c.parent[0]?.name : c.parent?.name,
      parent_slug: Array.isArray(c.parent) ? c.parent[0]?.slug : c.parent?.slug,
      is_main: !c.parent_id,
      is_sub: !!c.parent_id,
      product_count: 0,
      display_order: c.display_order ?? 999
    }))

    return NextResponse.json({
      success: true,
      categories,
      names: categories.map((c: any) => c.name),
      count: categories.length
    })
  } catch (error: any) {
    const msg = String(error?.message || '')
    if (msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('getaddrinfo')) {
      return NextResponse.json({
        success: true,
        categories: FALLBACK_CATEGORIES,
        names: FALLBACK_CATEGORIES.map(c => c.name),
        count: FALLBACK_CATEGORIES.length,
        fallback: true
      })
    }
    logger.error('Categories API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
