export const PRODUCT_IMAGE_FIELDS = ['image', 'image1', 'image2', 'image3', 'image4', 'image5'];

export function getProductImages(product) {
  return PRODUCT_IMAGE_FIELDS
    .map((field) => ({ field, url: product?.[field] }))
    .filter((image) => image.url);
}

export function assignImageToNextSlot(product, url) {
  const updates = {};
  const emptyField = PRODUCT_IMAGE_FIELDS.find((field) => !product?.[field]);
  updates[emptyField || 'image5'] = url;

  if (!product?.image) {
    updates.image = url;
    updates.image1 = product?.image1 || url;
  }

  return updates;
}
