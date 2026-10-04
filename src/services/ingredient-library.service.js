function searchable(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

function buildIngredientLibrary(rows, search = '', limit = 30) {
  const needle = searchable(search).slice(0, 80);
  const grouped = new Map();

  for (const row of rows) {
    const name = String(row.name || '').trim();
    const key = searchable(name);
    if (!key || (needle && !key.includes(needle))) continue;

    const current = grouped.get(key);
    if (current) {
      current.usage_count += 1;
      continue;
    }

    grouped.set(key, {
      name,
      is_default: row.is_default !== false,
      is_removable: Boolean(row.is_removable),
      usage_count: 1
    });
  }

  return [...grouped.values()]
    .sort((left, right) => right.usage_count - left.usage_count || left.name.localeCompare(right.name, 'es'))
    .slice(0, limit);
}

module.exports = { buildIngredientLibrary, searchable };
