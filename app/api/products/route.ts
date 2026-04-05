import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseCredentials } from '@/lib/supabase-server-utils'
import { validateAdminAccess, createAdminSupabaseClient } from '@/lib/admin-auth'
import { enhancedRateLimit } from '@/lib/enhanced-rate-limit'
import { logger } from '@/lib/logger'
import { transformProduct } from '@/lib/product-api-transform'

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

// POST /api/products — Create product (admin only; was missing and caused 405 from admin UI)
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = enhancedRateLimit(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: rateLimitResult.reason },
        {
          status: 429,
          headers: { 'Retry-After': rateLimitResult.retryAfter?.toString() || '60' },
        }
      )
    }

    const { error: authError } = await validateAdminAccess()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { id: _ignoreId, ...productData } = body as Record<string, any>

    if (!productData.name || productData.price == null) {
      return NextResponse.json(
        { error: 'Missing required fields: name and price' },
        { status: 400 }
      )
    }

    const { url, anonKey } = getSupabaseCredentials()
    const publicClient = createClient(url, anonKey)

    let categoryId = productData.category_id as string | undefined
    if (!categoryId && (productData.category || productData.category_slug)) {
      const categoryName = String(productData.category || '').trim()
      const categorySlug = String(
        productData.category_slug ||
          categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      )
      const { data: cat } = await publicClient
        .from('categories')
        .select('id, name, slug')
        .or(`name.eq.${categoryName},slug.eq.${categorySlug}`)
        .maybeSingle()
      if (cat?.id) categoryId = cat.id
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: 'Please select a valid sub category' },
        { status: 400 }
      )
    }

    const priceNum = Number(productData.price)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()

    const supabaseProduct: Record<string, any> = {
      name: String(productData.name).trim(),
      original_price:
        productData.originalPrice != null ? Number(productData.originalPrice) : priceNum,
      price: priceNum,
      rating: productData.rating ?? 0,
      reviews: productData.reviews ?? 0,
      image: productData.image != null ? String(productData.image) : '',
      category_id: categoryId,
      category: productData.category ? String(productData.category).trim() : null,
      brand: productData.brand ? String(productData.brand).trim() : '',
      description: productData.description != null ? String(productData.description) : '',
      specifications: productData.specifications ?? {},
      gallery: Array.isArray(productData.gallery) ? productData.gallery : [],
      sku: productData.sku ?? null,
      model: productData.model ?? null,
      views: productData.views ?? 0,
      video: productData.video ?? null,
      view360: productData.view360 ?? null,
      in_stock: productData.inStock !== undefined ? !!productData.inStock : true,
      stock_quantity: productData.stockQuantity ?? 0,
      free_delivery: !!productData.freeDelivery,
      same_day_delivery: !!productData.sameDayDelivery,
      import_china: !!productData.importChina,
      variant_config: productData.variantConfig ?? {},
      variant_images: Array.isArray(productData.variantImages) ? productData.variantImages : [],
      specification_images: Array.isArray(productData.specificationImages)
        ? productData.specificationImages
        : [],
      is_hidden: false,
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert(supabaseProduct)
      .select()
      .single()

    if (error) {
      logger.error('Product insert failed:', error)
      return NextResponse.json(
        { error: 'Failed to add product', details: error.message },
        { status: 500 }
      )
    }

    let calculatedTotalStock = 0
    if (Array.isArray(productData.variants) && productData.variants.length > 0) {
      productData.variants.forEach((variant: any) => {
        const qty =
          typeof variant.stock_quantity === 'number'
            ? variant.stock_quantity
            : typeof variant.stockQuantity === 'number'
              ? variant.stockQuantity
              : parseInt(String(variant.stock_quantity || variant.stockQuantity || 0), 10) || 0
        calculatedTotalStock += qty
      })
    }

    if (
      Array.isArray(productData.variants) &&
      productData.variants.length > 0 &&
      calculatedTotalStock > 0
    ) {
      await supabase
        .from('products')
        .update({
          stock_quantity: calculatedTotalStock,
          in_stock: calculatedTotalStock > 0,
        })
        .eq('id', product.id)
    }

    if (Array.isArray(productData.variants) && productData.variants.length > 0) {
      const variants = productData.variants.map((variant: any) => {
        const sq =
          typeof variant.stock_quantity === 'number'
            ? variant.stock_quantity
            : typeof variant.stockQuantity === 'number'
              ? variant.stockQuantity
              : parseInt(String(variant.stock_quantity || variant.stockQuantity || 0), 10) || 0
        return {
          product_id: product.id,
          variant_name: variant.variant_name ?? variant.name ?? null,
          price: variant.price ?? productData.price ?? 0,
          image: variant.image || null,
          sku: variant.sku || null,
          stock_quantity: sq,
          in_stock: sq > 0,
        }
      })
      const { error: variantError } = await supabase.from('product_variants').insert(variants)
      if (variantError) {
        logger.error('Product variants insert failed:', variantError)
      }
    }

    const { data: completeProduct, error: fetchError } = await supabase
      .from('products')
      .select(
        `
        *,
        product_variants (*),
        categories!category_id (id, name, slug, parent_id)
      `
      )
      .eq('id', product.id)
      .single()

    if (fetchError) {
      logger.error('Product refetch after create failed:', fetchError)
      return NextResponse.json(transformProduct(product), { status: 201 })
    }

    return NextResponse.json(transformProduct(completeProduct || product), { status: 201 })
  } catch (error: any) {
    logger.error('Error in products POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
