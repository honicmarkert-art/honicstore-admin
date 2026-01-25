import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseCredentials } from '@/lib/supabase-server-utils'
import { enhancedRateLimit } from '@/lib/enhanced-rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/products - Get products with optional filtering
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = enhancedRateLimit(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: rateLimitResult.reason },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfter?.toString() || '60'
          }
        }
      )
    }

    // Get Supabase credentials
    const { url, anonKey } = getSupabaseCredentials()
    const supabase = createClient(url, anonKey)

    const { searchParams } = new URL(request.url)
    const minimal = searchParams.get('minimal') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const category = searchParams.get('category')
    const brand = searchParams.get('brand')
    const search = searchParams.get('search')
    const inStock = searchParams.get('inStock') === 'true'

    // Build query
    let query = supabase
      .from('products')
      .select(minimal 
        ? 'id, name, price, original_price, image, category, brand, rating, reviews, in_stock, stock_quantity, free_delivery, same_day_delivery, import_china, is_new, updated_at, variant_config, sold_count, supplier_verified, product_variants (*)'
        : '*'
      )
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (category) {
      query = query.eq('category_id', category)
    }
    if (brand) {
      query = query.eq('brand', brand)
    }
    if (inStock) {
      query = query.eq('in_stock', true)
    }
    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase()
      query = query.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`)
    }

    const { data: products, error } = await query

    if (error) {
      logger.error('Failed to fetch products:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch products' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_hidden', false)

    if (category) countQuery = countQuery.eq('category_id', category)
    if (brand) countQuery = countQuery.eq('brand', brand)
    if (inStock) countQuery = countQuery.eq('in_stock', true)
    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase()
      countQuery = countQuery.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`)
    }

    const { count } = await countQuery

    return NextResponse.json({
      success: true,
      products: products || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    })

  } catch (error: any) {
    logger.error('Error in products API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
