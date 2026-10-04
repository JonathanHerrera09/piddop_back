function collectVariantOptionIds(variants) {
  const ids = [];
  const visit = (variant) => {
    for (const option of variant.options || []) {
      ids.push(Number(option.id));
      for (const child of option.childVariants || option.child_variants || []) visit(child);
    }
  };
  for (const variant of variants || []) visit(variant);
  return ids;
}

function serializeProductWithPrices(product) {
  const data = typeof product.toJSON === 'function' ? product.toJSON() : structuredClone(product);
  const prices = new Map(
    (data.variantOptionPrices || data.variant_option_prices || []).map((row) => [
      String(row.variant_option_id),
      Number(row.additional_price || 0)
    ])
  );

  const visit = (variant) => {
    for (const option of variant.options || []) {
      option.additional_price = prices.get(String(option.id)) || 0;
      for (const child of option.childVariants || option.child_variants || []) visit(child);
    }
  };
  for (const variant of data.variants || []) visit(variant);
  delete data.variantOptionPrices;
  delete data.variant_option_prices;
  return data;
}

module.exports = { collectVariantOptionIds, serializeProductWithPrices };
