import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseCredentials } from '@/lib/supabase-server-utils'
import { validateAdminAccess, createAdminSupabaseClient } from '@/lib/admin-auth'
import { enhancedRateLimit } from '@/lib/enhanced-rate-limit'
import { logger } from '@/lib/logger'
import { transformProduct } from '@/lib/product-api-transform'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params
    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const rateLimitResult = enhancedRateLimit(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: rateLimitResult.reason || 'Too many requests' },
        { status: 429, headers: { 'Retry-After': rateLimitResult.retryAfter?.toString() || '60' } }
      )
    }

    const { url, anonKey } = getSupabaseCredentials()
    const supabase = createClient(url, anonKey)

    const { data: product, error } = await supabase
      .from('products')
      .select('*, product_variants (*)')
      .eq('id', productId)
      .maybeSingle()

    if (error || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(transformProduct(product))
  } catch (error: any) {
    logger.error('Product [id] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params
    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const updates = await request.json().catch(() => ({}))
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()
    const supabaseUpdates: any = {}
    if (updates.name !== undefined) supabaseUpdates.name = updates.name
    if (updates.originalPrice !== undefined) supabaseUpdates.original_price = updates.originalPrice
    if (updates.price !== undefined) supabaseUpdates.price = updates.price
    if (updates.rating !== undefined) supabaseUpdates.rating = updates.rating
    if (updates.reviews !== undefined) supabaseUpdates.reviews = updates.reviews
    if (updates.image !== undefined) supabaseUpdates.image = updates.image
    if (updates.category !== undefined) supabaseUpdates.category = updates.category
    if ((updates as any).category_id !== undefined) supabaseUpdates.category_id = (updates as any).category_id
    if (updates.brand !== undefined) supabaseUpdates.brand = updates.brand
    if (updates.description !== undefined) supabaseUpdates.description = updates.description
    if (updates.specifications !== undefined) supabaseUpdates.specifications = updates.specifications
    if (updates.gallery !== undefined) supabaseUpdates.gallery = updates.gallery
    if (updates.sku !== undefined) supabaseUpdates.sku = updates.sku
    if (updates.model !== undefined) supabaseUpdates.model = updates.model
    if (updates.video !== undefined) supabaseUpdates.video = updates.video
    if (updates.view360 !== undefined) supabaseUpdates.view360 = updates.view360
    if (updates.inStock !== undefined) supabaseUpdates.in_stock = updates.inStock
    if (updates.stockQuantity !== undefined) supabaseUpdates.stock_quantity = updates.stockQuantity
    if (updates.freeDelivery !== undefined) supabaseUpdates.free_delivery = updates.freeDelivery
    if (updates.sameDayDelivery !== undefined) supabaseUpdates.same_day_delivery = updates.sameDayDelivery
    if (updates.importChina !== undefined) supabaseUpdates.import_china = updates.importChina
    if (updates.specificationImages !== undefined) supabaseUpdates.specification_images = updates.specificationImages
    if (updates.variantConfig !== undefined) supabaseUpdates.variant_config = updates.variantConfig

    const { data: product, error } = await supabase
      .from('products')
      .update(supabaseUpdates)
      .eq('id', productId)
      .select('*, product_variants (*)')
      .single()

    if (error) {
      logger.error('Product update failed:', error)
      return NextResponse.json({ error: error.message || 'Failed to update product' }, { status: 500 })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (Array.isArray(updates.variants)) {
      await supabase.from('product_variants').delete().eq('product_id', productId)
      if (updates.variants.length > 0) {
        const toInsert = updates.variants.map((v: any) => ({
          product_id: Number(productId),
          variant_name: v.variant_name ?? v.name ?? null,
          price: v.price ?? updates.price ?? 0,
          image: v.image ?? null,
          sku: v.sku ?? null,
          stock_quantity: typeof v.stock_quantity === 'number' ? v.stock_quantity : (v.stockQuantity ?? 0),
          in_stock: (typeof v.stock_quantity === 'number' ? v.stock_quantity : (v.stockQuantity ?? 0)) > 0
        }))
        await supabase.from('product_variants').insert(toInsert)
      }
    }

    const { data: finalProduct } = await supabase
      .from('products')
      .select('*, product_variants (*)')
      .eq('id', productId)
      .single()

    return NextResponse.json(transformProduct(finalProduct || product))
  } catch (error: any) {
    logger.error('Product [id] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params
    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const supabase = createAdminSupabaseClient()
    await supabase.from('product_variants').delete().eq('product_id', productId)
    const { error } = await supabase.from('products').delete().eq('id', productId)

    if (error) {
      logger.error('Product delete failed:', error)
      return NextResponse.json({ error: error.message || 'Failed to delete product' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Product [id] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
