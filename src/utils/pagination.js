const AppError = require('./app-error');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new AppError(`${name} must be a positive integer`, 422);
  return parsed;
}

function parsePagination(query = {}, options = {}) {
  const maxPageSize = options.maxPageSize || MAX_PAGE_SIZE;
  const page = positiveInteger(query.page, 1, 'page');
  const pageSize = positiveInteger(query.page_size ?? query.limit, options.defaultPageSize || DEFAULT_PAGE_SIZE, 'page_size');
  if (pageSize > maxPageSize) throw new AppError(`page_size cannot exceed ${maxPageSize}`, 422);
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  const allowedSort = options.allowedSort || {};
  let sortKey = options.defaultSortKey || 'id';
  let direction = options.defaultDirection || 'DESC';
  if (query.sort) {
    const raw = String(query.sort);
    const key = raw.startsWith('-') ? raw.slice(1) : raw;
    if (!Object.prototype.hasOwnProperty.call(allowedSort, key)) throw new AppError('Invalid sort field', 422);
    sortKey = allowedSort[key];
    direction = raw.startsWith('-') ? 'DESC' : 'ASC';
  }
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize, search, order: [[sortKey, direction]] };
}

async function paginate(model, options = {}, query = {}) {
  const parsed = parsePagination(query, options.pagination || options);
  const findOptions = { ...options };
  delete findOptions.pagination;
  delete findOptions.allowedSort;
  delete findOptions.defaultSortKey;
  delete findOptions.defaultDirection;
  delete findOptions.maxPageSize;
  delete findOptions.defaultPageSize;
  findOptions.limit = parsed.limit;
  findOptions.offset = parsed.offset;
  findOptions.order = query.sort ? parsed.order : (options.order || parsed.order);
  if (findOptions.include) findOptions.distinct = true;
  const result = await model.findAndCountAll(findOptions);
  const totalItems = Number(result.count);
  const totalPages = Math.ceil(totalItems / parsed.pageSize);
  return {
    items: result.rows,
    pagination: {
      page: parsed.page,
      page_size: parsed.pageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_previous: parsed.page > 1,
      has_next: parsed.page < totalPages
    }
  };
}

module.exports = { parsePagination, paginate, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
