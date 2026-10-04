const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { sequelize, Category, Company, HomePromotion, Popup, Product, ProductImage, ProductIngredient, ProductVariantOptionPrice, Service, Variant, VariantOption } = require('../models');
const { getGlobalCoverageSetting } = require('../services/platform-setting.service');
const { availabilityData } = require('../services/company-availability.service');

const COMPANY_TYPE_LABELS = {
  food: 'Restaurante',
  products: 'Supermercado',
  services: 'Servicios'
};

const COMPANY_TYPE_CATEGORY_LABELS = {
  food: 'Comida',
  products: 'Mercado',
  services: 'Servicios'
};

function shuffle(items) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ item }) => item);
}

function normalizeImageUrl(pathname) {
  return pathname || null;
}

function buildEta(companyId, companyType) {
  const baseByType = {
    food: [20, 35],
    products: [20, 30],
    services: [25, 40]
  };

  const [minBase, maxBase] = baseByType[companyType] || [20, 35];
  const offset = Number(companyId) % 4;

  return {
    min: minBase + offset,
    max: maxBase + offset
  };
}

function buildCompanyCard(company) {
  const firstProduct = company.products?.[0];
  const firstProductImage = firstProduct?.images?.[0];
  const eta = buildEta(company.id, company.type);
  const numericRating = Number(company.rating);
  const fallbackRating = 4.5 + (Number(company.id) % 5) * 0.1;

  return {
    id: company.id,
    name: company.name,
    type: company.type,
    type_label: COMPANY_TYPE_LABELS[company.type] || 'Negocio',
    description: company.description,
    address: company.address,
    image_url: normalizeImageUrl(company.logo || firstProductImage?.image_url),
    rating: (numericRating > 0 ? numericRating : fallbackRating).toFixed(1),
    eta_min: eta.min,
    eta_max: eta.max,
    delivery_badge: 'Envio gratis',
    ...availabilityData(company)
  };
}

function buildProductCard(product) {
  const priceByOption = new Map((product.variantOptionPrices || []).map((price) => [
    String(price.variant_option_id),
    Number(price.additional_price || 0)
  ]));
  const buildVariant = (variant) => ({
    id: variant.id,
    name: variant.name,
    selection_type: variant.selection_type,
    required: Boolean(variant.required),
    min_selections: Number(variant.min_selections || 0),
    max_selections: Number(variant.max_selections || 0),
    options: (variant.options || []).map((option) => ({
      id: option.id,
      name: option.name,
      additional_price: priceByOption.get(String(option.id)) || 0,
      child_variants: (option.childVariants || []).map(buildVariant)
    }))
  });

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: Number(product.base_price || 0),
    image_url: normalizeImageUrl(product.images?.[0]?.image_url || null),
    variants: (product.variants || []).map(buildVariant),
    ingredients: (product.ingredients || []).map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      is_removable: Boolean(ingredient.is_removable),
      is_default: Boolean(ingredient.is_default)
    })),
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          type: product.category.type
        }
      : null
  };
}

function buildServiceCard(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    price: Number(service.price || 0),
    duration_minutes: service.duration_minutes
  };
}

function resolveCoverageCenter(coverage) {
  if (coverage.center?.latitude != null && coverage.center?.longitude != null) {
    return coverage.center;
  }

  if (!coverage.polygon?.length) {
    return null;
  }

  const totals = coverage.polygon.reduce(
    (accumulator, point) => ({
      latitude: accumulator.latitude + Number(point.latitude || 0),
      longitude: accumulator.longitude + Number(point.longitude || 0)
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: totals.latitude / coverage.polygon.length,
    longitude: totals.longitude / coverage.polygon.length
  };
}

const home = asyncHandler(async (_req, res) => {
  const now = new Date();

  const [categories, promotions, popups, companies, popularProducts] = await Promise.all([
    Category.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
      limit: 8
    }),
    HomePromotion.findAll({
      where: {
        status: 'active',
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] }
        ]
      },
      order: [['display_order', 'ASC'], ['id', 'DESC']],
      limit: 6
    }),
    Popup.findAll({
      where: {
        status: 'active',
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] }
        ]
      },
      order: [['display_order', 'ASC'], ['id', 'DESC']],
      limit: 3
    }),
    Company.findAll({
      where: {
        status: 'active',
        type: { [Op.in]: ['food', 'products', 'services'] }
      },
      include: [
        {
          model: Product,
          as: 'products',
          where: { status: 'active' },
          required: false,
          include: [{ model: ProductImage, as: 'images', required: false }],
          limit: 1
        }
      ],
      order: [['id', 'DESC']]
    }),
    Product.findAll({ where: { status: 'active' }, include: [{ model: ProductImage, as: 'images', required: false }, { model: Company, as: 'company', where: { status: 'active' }, required: true }], order: sequelize.random(), limit: 10 })
  ]);

  const mappedCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    type: category.type,
    icon: category.icon
  }));

  const mappedPromotions = promotions.map((promotion) => ({
    id: promotion.id,
    title: promotion.title,
    message: promotion.message,
    image_url: normalizeImageUrl(promotion.image_url),
    link_url: promotion.link_url
  }));

  const mappedPopups = popups.map((popup) => ({
    id: popup.id,
    title: popup.title,
    message: popup.message,
    image_url: normalizeImageUrl(popup.image_url),
    link_url: popup.link_url
  }));

  const nearbyCompanies = shuffle(companies)
    .slice(0, 8)
    .map(buildCompanyCard);

  return success(res, {
    message: 'Mobile home retrieved successfully',
    data: {
      categories: mappedCategories,
      popups: mappedPopups,
      promotions: mappedPromotions,
      nearby_companies: nearbyCompanies,
      popular_products: popularProducts.map((product) => ({ id: product.id, name: product.name, price: Number(product.base_price || 0), image_url: normalizeImageUrl(product.images?.[0]?.image_url), company_id: product.company_id, company_name: product.company?.name || 'Negocio' }))
    }
  });
});

const listCompanies = asyncHandler(async (req, res) => {
  const type = req.query.type ? String(req.query.type).trim() : null;
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const where = {
    status: 'active',
    type: { [Op.in]: ['food', 'products', 'services'] }
  };

  if (type) {
    where.type = type;
  }

  const productInclude = {
    model: Product,
    as: 'products',
    where: { status: 'active' },
    required: Boolean(categoryId),
    include: [
      { model: ProductImage, as: 'images', required: false },
      {
        model: Category,
        as: 'category',
        required: Boolean(categoryId),
        ...(categoryId ? { where: { id: categoryId } } : {})
      }
    ],
    limit: 1
  };

  const companies = await Company.findAll({
    where,
    include: [productInclude],
    order: [['id', 'DESC']]
  });

  return success(res, {
    message: 'Mobile companies retrieved successfully',
    data: {
      companies: companies.map(buildCompanyCard)
    }
  });
});

const companyDetail = asyncHandler(async (req, res) => {
  const company = await Company.findOne({
    where: {
      id: req.params.id,
      status: 'active'
    },
    include: [
      {
        model: Product,
        as: 'products',
        where: { status: 'active' },
        required: false,
        include: [
          { model: ProductImage, as: 'images', required: false },
          { model: Category, as: 'category', required: false },
          { model: ProductIngredient, as: 'ingredients', required: false, where: { status: 'active' } },
          { model: ProductVariantOptionPrice, as: 'variantOptionPrices', required: false },
          {
            model: Variant,
            as: 'variants',
            required: false,
            where: { status: 'active' },
            through: { attributes: [] },
            include: [{
              model: VariantOption,
              as: 'options',
              required: false,
              where: { status: 'active' },
              include: [{
                model: Variant,
                as: 'childVariants',
                required: false,
                where: { status: 'active' },
                include: [{ model: VariantOption, as: 'options', required: false, where: { status: 'active' } }]
              }]
            }]
          }
        ]
      },
      {
        model: Service,
        as: 'services',
        where: { status: 'active' },
        required: false
      }
    ]
  });

  if (!company) {
    throw new AppError('Company not found', 404);
  }

  const productCategories = (company.products || [])
    .map((product) => product.category)
    .filter(Boolean)
    .map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type
    }));

  const fallbackCategory = {
    id: Number(`9${company.id}`),
    name: COMPANY_TYPE_CATEGORY_LABELS[company.type] || 'Catalogo',
    type: company.type
  };

  const categories = [...new Map([...productCategories, fallbackCategory].map((category) => [`${category.type}-${category.name}`, category])).values()];

  return success(res, {
    message: 'Mobile company detail retrieved successfully',
    data: {
      company: {
        ...buildCompanyCard(company),
        phone: company.phone,
        email: company.email
      },
      categories,
      products: (company.products || []).map(buildProductCard),
      services: (company.services || []).map(buildServiceCard)
    }
  });
});

const search = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (query.length < 2) {
    return success(res, {
      message: 'Search query is too short',
      data: { companies: [] }
    });
  }

  const like = `%${query}%`;
  const [companyMatches, productMatches, serviceMatches] = await Promise.all([
    Company.findAll({
      where: {
        status: 'active',
        type: { [Op.in]: ['food', 'products', 'services'] },
        name: { [Op.like]: like }
      },
      attributes: ['id']
    }),
    Product.findAll({
      where: {
        status: 'active',
        name: { [Op.like]: like }
      },
      attributes: ['company_id']
    }),
    Service.findAll({
      where: {
        status: 'active',
        name: { [Op.like]: like }
      },
      attributes: ['company_id']
    })
  ]);

  const companyIds = [
    ...companyMatches.map((company) => company.id),
    ...productMatches.map((product) => product.company_id),
    ...serviceMatches.map((service) => service.company_id)
  ];

  const uniqueCompanyIds = [...new Set(companyIds)].filter(Boolean);

  if (!uniqueCompanyIds.length) {
    return success(res, {
      message: 'Search results retrieved successfully',
      data: { companies: [] }
    });
  }

  const companies = await Company.findAll({
    where: {
      id: uniqueCompanyIds,
      status: 'active'
    },
    include: [
      {
        model: Product,
        as: 'products',
        where: { status: 'active' },
        required: false,
        include: [{ model: ProductImage, as: 'images', required: false }],
        limit: 1
      }
    ],
    order: [['id', 'DESC']],
    limit: 20
  });

  return success(res, {
    message: 'Search results retrieved successfully',
    data: {
      companies: companies.map(buildCompanyCard)
    }
  });
});

const coverage = asyncHandler(async (_req, res) => {
  const globalCoverage = await getGlobalCoverageSetting();

  return success(res, {
    message: 'Mobile coverage retrieved successfully',
    data: {
      coverage: {
        enabled: globalCoverage.enabled,
        center: resolveCoverageCenter(globalCoverage),
        polygon: globalCoverage.polygon || []
      }
    }
  });
});

module.exports = { home, listCompanies, companyDetail, search, coverage };
