import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase-server'
import { logger } from '@/lib/logger'
import { enhancedRateLimit } from '@/lib/enhanced-rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Use service role key for admin operations (bypasses RLS)
const getSupabase = () => {
  try {
    return getSupabaseClient()
  } catch (error) {
    logger.error('Failed to initialize Supabase client:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = enhancedRateLimit(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: rateLimitResult.reason },
        { status: 429, headers: { 'Retry-After': rateLimitResult.retryAfter?.toString() || '60' } }
      )
    }

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 })
    }
    
    logger.log('📤 Media upload API called (using service role key)')
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string
    const context = formData.get('context') as string || 'product'
    const productId = formData.get('productId') as string

    logger.log('📋 Upload details:', {
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      mediaType: type,
      context: context,
      productId: productId
    })

    if (!file) {
      logger.log('❌ No file provided')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!type || !['image', 'video', 'model3d'].includes(type)) {
      logger.log('❌ Invalid media type:', type)
      return NextResponse.json({ error: 'Invalid media type. Allowed types: image, video, model3d' }, { status: 400 })
    }

    // Validate file MIME type based on declared type
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    const allowedModelTypes = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
    
    let allowedTypes: string[] = []
    if (type === 'image') {
      allowedTypes = allowedImageTypes
    } else if (type === 'video') {
      allowedTypes = allowedVideoTypes
    } else if (type === 'model3d') {
      allowedTypes = allowedModelTypes
    }

    if (!allowedTypes.includes(file.type)) {
      logger.log('❌ Invalid file MIME type:', file.type, 'for type:', type)
      return NextResponse.json({ 
        error: `Invalid file type. Expected ${type} file but got ${file.type}`,
        allowedTypes: allowedTypes
      }, { status: 400 })
    }

    // Validate file size based on type
    let maxSize: number
    if (type === 'image') {
      maxSize = 5 * 1024 * 1024 // 5MB for images
    } else if (type === 'video') {
      maxSize = 50 * 1024 * 1024 // 50MB for videos
    } else {
      maxSize = 10 * 1024 * 1024 // 10MB for 3D models
    }

    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024))
      return NextResponse.json({ 
        error: `File too large. Maximum size for ${type} files is ${maxSizeMB}MB`,
        maxSize: maxSize,
        fileSize: file.size
      }, { status: 400 })
    }

    // Validate file extension matches MIME type
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const extensionMap: Record<string, string[]> = {
      'image': ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'svg'],
      'video': ['mp4', 'webm', 'ogg', 'mov'],
      'model3d': ['glb', 'gltf', 'obj']
    }
    
    // JFIF files are JPEG files, so accept them if MIME type is image/jpeg
    if (fileExtension === 'jfif' && file.type === 'image/jpeg') {
      logger.log('✅ JFIF file detected (JPEG format):', file.name)
    } else if (fileExtension && extensionMap[type] && !extensionMap[type].includes(fileExtension)) {
      logger.log('❌ Invalid file extension:', fileExtension, 'for type:', type)
      return NextResponse.json({ 
        error: `Invalid file extension. Expected one of: ${extensionMap[type].join(', ')}`,
        receivedExtension: fileExtension
      }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 15)
    const fileExt = fileExtension || file.name.split('.').pop() || 'file'
    
    // Generate product-specific filename if productId is provided
    let fileName: string
    if (productId && (context === 'product' || context === 'variant' || context === 'specification')) {
      fileName = `product_${productId}_${type}_${timestamp}.${fileExt}`
    } else {
      fileName = `${type}_${timestamp}_${randomString}.${fileExt}`
    }
    
    logger.log('📝 Generated filename:', fileName)

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(fileBuffer)

    // Determine bucket based on type and context
    const bucketName = getBucketName(type, context)
    logger.log('📦 Using bucket:', bucketName)

    // Check if bucket exists (for specification-images bucket)
    if (bucketName === 'specification-images') {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets()
      const bucketExists = buckets?.some(b => b.name === bucketName)
      if (!bucketExists) {
        logger.log('❌ Bucket does not exist:', bucketName)
        return NextResponse.json({ 
          error: `Storage bucket '${bucketName}' does not exist. Please create it in Supabase Dashboard.`,
          bucket: bucketName
        }, { status: 400 })
      }
    }

    // Upload to Supabase Storage
    logger.log('⬆️ Uploading to Supabase...')
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (error) {
      // Check for specific error types based on message
      const isNotFound = error.message?.includes('not found') || error.message?.includes('404')
      return NextResponse.json({ 
        error: 'Upload failed', 
        details: error.message,
        bucket: bucketName
      }, { status: isNotFound ? 400 : 500 })
    }

    logger.log('✅ Upload successful:', data)

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName)

    // If this is a product image upload, delete old image and update the product's image field
    if (productId && context === 'product' && type === 'image') {
      logger.log(`🔄 Updating product ${productId} image field...`)
      
      // First, get the old image URL from the product
      const { data: oldProduct } = await supabase
        .from('products')
        .select('image')
        .eq('id', parseInt(productId))
        .single()
      
      // Delete old image if it exists
      if (oldProduct?.image) {
        logger.log('🗑️ Deleting old product image:', oldProduct.image)
        
        // Extract filename from URL
        const oldFileName = oldProduct.image.split('/').pop()
        if (oldFileName) {
          const { error: deleteError } = await supabase.storage
            .from(bucketName)
            .remove([oldFileName])
          
          if (deleteError) {
            logger.log('⚠️ Failed to delete old image:', deleteError.message)
          } else {
            logger.log('✅ Old image deleted successfully')
          }
        }
      }
      
      // Update product with new image URL
      const { error: updateError } = await supabase
        .from('products')
        .update({ image: urlData.publicUrl })
        .eq('id', parseInt(productId))
        
      if (updateError) {
        logger.log('⚠️ Failed to update product image field:', updateError.message)
      } else {
        logger.log('✅ Product image field updated successfully')
      }
    }

    // If this is a variant image upload, append to products.variant_images immediately
    if (productId && context === 'variant' && type === 'image') {
      try {
        const pid = parseInt(productId)
        const { data: existing } = await supabase
          .from('products')
          .select('variant_images')
          .eq('id', pid)
          .single()

        const current: any[] = Array.isArray(existing?.variant_images) ? existing.variant_images : []
        // Normalize to array of objects: { imageUrl: string }
        const normalized: Array<{ imageUrl: string }> = current.map((it: any) =>
          typeof it === 'string' ? { imageUrl: it } : { imageUrl: String(it?.imageUrl || '') }
        ).filter(it => !!it.imageUrl)

        // Append if not already present
        const exists = normalized.some(it => it.imageUrl === urlData.publicUrl)
        const merged = exists ? normalized : [...normalized, { imageUrl: urlData.publicUrl }]

        const { error: updErr } = await supabase
          .from('products')
          .update({ variant_images: merged })
          .eq('id', pid)

        if (updErr) {
          logger.log('⚠️ Failed to update variant images:', updErr.message)
        } else {
          logger.log('✅ Variant images updated successfully')
        }
      } catch (e) {
        logger.log('⚠️ Error updating variant images:', e)
      }
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      fileName: fileName,
      size: file.size,
      type: file.type
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

  } catch (error) {
    logger.error('Error in media upload API:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function getBucketName(type: string, context: string = 'product'): string {
  // For images, use different buckets based on context
  if (type === 'image') {
    switch (context) {
      case 'category':
        return 'category-images'
      case 'variant':
        return 'variant-images'
      case 'specification':
        return 'specification-images'
      case 'product':
      default:
        return 'product-images'
    }
  }
  
  // For videos and 3D models, always use product buckets
  switch (type) {
    case 'video':
      return 'product-videos'
    case 'model3d':
      return 'product-models'
    default:
      return 'media'
  }
}

// GET endpoint to list media files
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 })
    }
    
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const bucket = searchParams.get('bucket')
    const context = searchParams.get('context') || 'product'
    const productId = searchParams.get('productId')

    if (!type && !bucket) {
      return NextResponse.json({ error: 'Type or bucket required' }, { status: 400 })
    }

    const bucketName = bucket || getBucketName(type || 'image', context)

    const { data, error } = await supabase.storage
      .from(bucketName)
      .list('', {
        limit: 100,
        offset: 0
      })

    if (error) {
      return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
    }

    // Get public URLs for each file
    let filesWithUrls = data.map(file => {
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(file.name)

      return {
        name: file.name,
        size: file.metadata?.size,
        lastModified: file.updated_at,
        url: urlData.publicUrl,
        productId: extractProductIdFromFilename(file.name)
      }
    })

    // Filter by productId if provided
    if (productId) {
      filesWithUrls = filesWithUrls.filter(file => 
        file.productId === productId || file.name.startsWith(`product_${productId}_`)
      )
    }

    return NextResponse.json({
      success: true,
      files: filesWithUrls
    })

  } catch (error) {
    logger.error('Error in media list API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to extract product ID from filename
function extractProductIdFromFilename(filename: string): string | null {
  const match = filename.match(/^product_(\d+)_/)
  return match ? match[1] : null
}
