const AppError = require('../utils/app-error');

function normalizeRecord(record) {
  return typeof record.toJSON === 'function' ? record.toJSON() : record;
}

function childVariants(option) {
  return option.child_variants || option.childVariants || [];
}

function validateVariantSelections(variants, selectedOptionIds) {
  const selectedIds = [...new Set(selectedOptionIds.map((id) => Number(id)))];
  if (selectedIds.some((id) => !Number.isInteger(id))) {
    throw new AppError('Variant option ids must be whole numbers', 422);
  }

  const allActiveIds = new Set();
  const collectActiveIds = (rawVariant) => {
    const variant = normalizeRecord(rawVariant);
    if (variant.status === 'inactive') return;
    for (const rawOption of variant.options || []) {
      const option = normalizeRecord(rawOption);
      if (option.status === 'inactive') continue;
      allActiveIds.add(Number(option.id));
      childVariants(option).forEach(collectActiveIds);
    }
  };
  variants.forEach(collectActiveIds);
  if (selectedIds.some((id) => !allActiveIds.has(id))) {
    throw new AppError('One or more variant options are not active for this product', 422);
  }

  const consumedIds = new Set();

  function validateGroup(rawVariant) {
    const variant = normalizeRecord(rawVariant);
    if (variant.status === 'inactive') return;
    const activeOptions = (variant.options || []).map(normalizeRecord).filter((option) => option.status !== 'inactive');
    const activeIds = new Set(activeOptions.map((option) => Number(option.id)));
    const selections = selectedIds.filter((id) => activeIds.has(id));
    selections.forEach((id) => consumedIds.add(id));

    const configuredMinimum = Number(variant.min_selections || 0);
    const minimum = variant.required ? Math.max(1, configuredMinimum) : configuredMinimum;
    const configuredMaximum = Number(variant.max_selections || 0);
    const maximum = variant.selection_type === 'single' ? 1 : (configuredMaximum || activeOptions.length);

    if (selections.length < minimum) throw new AppError(`Select at least ${minimum} option(s) for ${variant.name}`, 422);
    if (selections.length > maximum) throw new AppError(`Select at most ${maximum} option(s) for ${variant.name}`, 422);

    for (const option of activeOptions) {
      if (activeIds.has(Number(option.id)) && selections.includes(Number(option.id))) {
        childVariants(option).forEach(validateGroup);
      }
    }
  }

  variants.map(normalizeRecord).forEach(validateGroup);

  if (consumedIds.size !== selectedIds.length) {
    throw new AppError('One or more variant options are inactive, unrelated, or require another selection first', 422);
  }

  return selectedIds;
}

module.exports = { validateVariantSelections };
