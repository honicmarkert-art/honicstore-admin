import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseCredentials } from '@/lib/supabase-server-utils'
import { enhancedRateLimit } from '@/lib/enhanced-rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

    const { data: brands, error } = await supabase
      .from('products')
      .select('brand')
      .not('brand', 'is', null)
      .not('brand', 'eq', '')
      .order('brand')

    if (error) {
      logger.error('Failed to fetch brands:', error)
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 })
    }

    const uniqueBrands = [...new Set((brands || []).map((item: any) => item.brand))]
      .filter((brand: string) => brand && String(brand).trim() !== '')
      .sort()

    return NextResponse.json({
      success: true,
      brands: uniqueBrands,
      count: uniqueBrands.length
    })
  } catch (error: any) {
    logger.error('Brands API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
