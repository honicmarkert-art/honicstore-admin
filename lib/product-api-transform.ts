/**
 * Shared product row → admin API JSON shape.
 * Kept out of route files so App Router bundles do not cross-import API routes (avoids missing webpack chunks).
 */
export function transformProduct(product: any) {
  let parsedSpecifications = {}
  if (product.specifications) {
    if (typeof product.specifications === 'string') {
      try {
        parsedSpecifications = JSON.parse(product.specifications)
      } catch {
        parsedSpecifications = {}
      }
    } else if (typeof product.specifications === 'object' && product.specifications !== null) {
      parsedSpecifications = product.specifications
    }
  }

  const variantImages = (product.variant_images || []).map((img: any) =>
    typeof img === 'string'
      ? { imageUrl: img }
      : img && typeof img === 'object' && img.imageUrl
        ? { imageUrl: img.imageUrl }
        : { imageUrl: String(img || '') }
  ).filter((img: { imageUrl: string }) => img.imageUrl)

  let specificationImages = product.specification_images || []
  if (typeof specificationImages === 'string') {
    try {
      specificationImages = JSON.parse(specificationImages)
    } catch {
      specificationImages = []
    }
  }
  if (!Array.isArray(specificationImages)) specificationImages = []

  return {
    id: product.id,
    name: product.name,
    originalPrice: product.original_price,
    price: product.price,
    rating: product.rating,
    reviews: product.reviews,
    image: product.image,
    category_id: product.category_id,
    category:
      product.categories &&
      typeof product.categories === 'object' &&
      product.categories.name
        ? product.categories.name
        : product.category,
    brand: product.brand,
    description: product.description,
    specifications: parsedSpecifications,
    gallery: product.gallery || [],
    sku: product.sku,
    model: product.model,
    views: product.views,
    video: product.video,
    view360: product.view360,
    inStock: product.in_stock,
    stockQuantity: product.stock_quantity,
    freeDelivery: product.free_delivery,
    sameDayDelivery: product.same_day_delivery,
    importChina: !!product.import_china,
    variants: (product.product_variants || []).map((variant: any) => {
      const attributes = variant.attributes || {}
      const quantities = variant.stock_quantities || {}
      const cleanAttributes = { ...attributes }
      Object.keys(cleanAttributes).forEach(key => {
        if (key.endsWith('_quantity') || key === '_quantities') delete cleanAttributes[key]
      })
      return {
        id: variant.id,
        price: variant.price,
        image: variant.image,
        sku: variant.sku,
        model: variant.model,
        variantType: variant.variant_type,
        attributes: cleanAttributes,
        quantities,
        primaryAttribute: variant.primary_attribute,
        dependencies: variant.dependencies || {},
        primaryValues: variant.primary_values || [],
        stockQuantity: typeof variant.stock_quantity === 'number' ? variant.stock_quantity : undefined,
        stock_quantity: typeof variant.stock_quantity === 'number' ? variant.stock_quantity : undefined,
        inStock: typeof variant.stock_quantity === 'number' ? variant.stock_quantity > 0 : true,
        in_stock: typeof variant.stock_quantity === 'number' ? variant.stock_quantity > 0 : true,
        variant_name: variant.variant_name || null
      }
    }),
    variantConfig: product.variant_config || {},
    variantImages,
    specificationImages
  }
}
