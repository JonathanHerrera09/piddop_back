const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config/database')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize(config);
const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };

const Role = sequelize.define('Role', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(50), allowNull: false },
  description: DataTypes.STRING(255),
  scope: DataTypes.ENUM('platform', 'company')
}, { tableName: 'roles', ...timestamps });

const User = sequelize.define('User', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  role_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  last_name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(191), allowNull: false },
  phone: { type: DataTypes.STRING(30), allowNull: false },
  google_sub: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  profile_image: DataTypes.STRING(500),
  email_verified_at: DataTypes.DATE,
  status: DataTypes.ENUM('active', 'inactive', 'suspended')
}, { tableName: 'users', ...timestamps });

const AuthRefreshToken = sequelize.define('AuthRefreshToken', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  token_hash: { type: DataTypes.STRING(255), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  revoked_at: DataTypes.DATE
}, { tableName: 'auth_refresh_tokens', createdAt: 'created_at', updatedAt: false });

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  token_hash: { type: DataTypes.STRING(255), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used_at: DataTypes.DATE
}, { tableName: 'password_reset_tokens', createdAt: 'created_at', updatedAt: false });

const EmailVerificationCode = sequelize.define('EmailVerificationCode', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING(191), allowNull: false },
  code_hash: { type: DataTypes.STRING(64), allowNull: false },
  registration_json: { type: DataTypes.JSON, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  attempts: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  consumed_at: DataTypes.DATE
}, { tableName: 'email_verification_codes', createdAt: 'created_at', updatedAt: false });
const UserLegalAcceptance = sequelize.define('UserLegalAcceptance', { id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, document_key: { type: DataTypes.STRING(80), allowNull: false }, document_version: { type: DataTypes.STRING(40), allowNull: false }, accepted_at: { type: DataTypes.DATE, allowNull: false }, source: { type: DataTypes.STRING(40), allowNull: false }, ip_address: DataTypes.STRING(45), user_agent: DataTypes.STRING(500) }, { tableName: 'user_legal_acceptances', ...timestamps });

const Permission = sequelize.define('Permission', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(100), allowNull: false },
  name: { type: DataTypes.STRING(150), allowNull: false },
  module: { type: DataTypes.STRING(100), allowNull: false },
  description: DataTypes.STRING(500),
  status: DataTypes.ENUM('active', 'inactive')
}, { tableName: 'permissions', ...timestamps });

const RolePermission = sequelize.define('RolePermission', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  role_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  permission_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  create_permission: DataTypes.BOOLEAN,
  update_permission: DataTypes.BOOLEAN,
  delete_permission: DataTypes.BOOLEAN,
  view_permission: DataTypes.BOOLEAN,
  execute_permission: DataTypes.BOOLEAN
}, { tableName: 'role_permissions', ...timestamps });

const Company = sequelize.define('Company', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  type: DataTypes.ENUM('food', 'products', 'services'),
  description: DataTypes.TEXT,
  phone: DataTypes.STRING(30),
  email: DataTypes.STRING(191),
  logo: DataTypes.STRING(500),
  address: DataTypes.STRING(500),
  latitude: DataTypes.DECIMAL(10, 7),
  longitude: DataTypes.DECIMAL(10, 7),
  coverage_enabled: DataTypes.BOOLEAN,
  coverage_polygon: DataTypes.JSON,
  availability_mode: DataTypes.ENUM('automatic', 'open', 'closed'),
  business_hours: DataTypes.JSON,
  timezone: DataTypes.STRING(64),
  rating: DataTypes.DECIMAL(3, 2),
  commission_percentage: DataTypes.DECIMAL(5, 2),
  status: DataTypes.ENUM('pending', 'active', 'suspended', 'inactive')
}, { tableName: 'companies', ...timestamps });
const CompanyWallet = sequelize.define('CompanyWallet', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  company_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  balance: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(10), allowNull: false },
  status: DataTypes.ENUM('active', 'low_balance', 'insufficient_balance')
}, { tableName: 'company_wallets', ...timestamps });
const WalletTransaction = sequelize.define('WalletTransaction', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  company_wallet_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  company_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  type: { type: DataTypes.ENUM('topup', 'order_commission', 'refund', 'bonus', 'manual_credit', 'manual_debit', 'adjustment'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  balance_before: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  balance_after: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  reference_type: DataTypes.STRING(40),
  reference_id: DataTypes.BIGINT.UNSIGNED,
  description: DataTypes.STRING(500),
  metadata: DataTypes.JSON,
  created_by: DataTypes.BIGINT.UNSIGNED
}, { tableName: 'wallet_transactions', createdAt: 'created_at', updatedAt: false });

const CompanySettlement = sequelize.define('CompanySettlement', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  settlement_number: { type: DataTypes.STRING(40), allowNull: false }, company_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  period_start: { type: DataTypes.DATE, allowNull: false }, period_end: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('issued', 'paid'), allowNull: false }, currency: { type: DataTypes.STRING(10), allowNull: false },
  order_count: DataTypes.INTEGER.UNSIGNED, gross_sales: DataTypes.DECIMAL(14, 2), discounts: DataTypes.DECIMAL(14, 2),
  net_product_sales: DataTypes.DECIMAL(14, 2), delivery_fees: DataTypes.DECIMAL(14, 2), customer_paid_total: DataTypes.DECIMAL(14, 2),
  platform_commission: DataTypes.DECIMAL(14, 2), amount_payable: DataTypes.DECIMAL(14, 2), notes: DataTypes.STRING(1000),
  payout_method: DataTypes.STRING(50), payout_reference: DataTypes.STRING(191), paid_at: DataTypes.DATE, issued_at: DataTypes.DATE,
  created_by: DataTypes.BIGINT.UNSIGNED, document_hash: DataTypes.STRING(64),
  closure_type: DataTypes.ENUM('weekly', 'monthly', 'custom'), period_orders_count: DataTypes.INTEGER.UNSIGNED,
  period_total_sales: DataTypes.DECIMAL(14, 2), period_pse_sales: DataTypes.DECIMAL(14, 2), period_cash_sales: DataTypes.DECIMAL(14, 2),
  period_customer_paid: DataTypes.DECIMAL(14, 2), period_commissions: DataTypes.DECIMAL(14, 2), period_topups: DataTypes.DECIMAL(14, 2),
  period_wallet_credits: DataTypes.DECIMAL(14, 2), period_wallet_debits: DataTypes.DECIMAL(14, 2),
  opening_wallet_balance: DataTypes.DECIMAL(14, 2), closing_wallet_balance: DataTypes.DECIMAL(14, 2)
}, { tableName: 'company_settlements', ...timestamps });

const CompanySettlementItem = sequelize.define('CompanySettlementItem', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, settlement_id: DataTypes.BIGINT.UNSIGNED,
  order_id: DataTypes.BIGINT.UNSIGNED, payment_id: DataTypes.BIGINT.UNSIGNED, order_number: DataTypes.STRING(40),
  payment_provider: DataTypes.STRING(100), payment_reference: DataTypes.STRING(191), paid_at: DataTypes.DATE,
  subtotal: DataTypes.DECIMAL(14, 2), discount: DataTypes.DECIMAL(14, 2), net_product_sale: DataTypes.DECIMAL(14, 2),
  delivery_fee: DataTypes.DECIMAL(14, 2), customer_paid_total: DataTypes.DECIMAL(14, 2), commission_amount: DataTypes.DECIMAL(14, 2),
  company_payable: DataTypes.DECIMAL(14, 2)
}, { tableName: 'company_settlement_items', createdAt: 'created_at', updatedAt: false });

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, user_id: DataTypes.BIGINT.UNSIGNED,
  action: DataTypes.STRING(100), entity_type: DataTypes.STRING(100), entity_id: DataTypes.BIGINT.UNSIGNED,
  old_values: DataTypes.JSON, new_values: DataTypes.JSON, ip_address: DataTypes.STRING(45), user_agent: DataTypes.STRING(500)
}, { tableName: 'audit_logs', createdAt: 'created_at', updatedAt: false });

const CompanyUser = sequelize.define('CompanyUser', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  company_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  role: DataTypes.ENUM('owner', 'manager', 'staff')
}, { tableName: 'company_users', ...timestamps });

const CompanyUserRole = sequelize.define('CompanyUserRole', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  company_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  role_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }
}, { tableName: 'company_user_roles', ...timestamps });

const Category = sequelize.define('Category', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false }, icon: DataTypes.STRING(500),
  type: DataTypes.ENUM('food', 'products', 'services'), status: DataTypes.ENUM('active', 'inactive')
}, { tableName: 'categories', ...timestamps });
const Product = sequelize.define('Product', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, company_id: DataTypes.BIGINT.UNSIGNED,
  category_id: DataTypes.BIGINT.UNSIGNED, name: DataTypes.STRING(180), description: DataTypes.TEXT,
  base_price: DataTypes.DECIMAL(12, 2), status: DataTypes.ENUM('active', 'inactive', 'out_of_stock')
}, { tableName: 'products', ...timestamps });
const ProductImage = sequelize.define('ProductImage', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, product_id: DataTypes.BIGINT.UNSIGNED,
  image_url: DataTypes.STRING(500), sort_order: DataTypes.SMALLINT.UNSIGNED
}, { tableName: 'product_images', createdAt: 'created_at', updatedAt: false });
const ProductIngredient = sequelize.define('ProductIngredient', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, product_id: DataTypes.BIGINT.UNSIGNED,
  name: DataTypes.STRING(120), is_removable: DataTypes.BOOLEAN, is_default: DataTypes.BOOLEAN,
  status: DataTypes.ENUM('active', 'inactive'), sort_order: DataTypes.SMALLINT.UNSIGNED
}, { tableName: 'product_ingredients', ...timestamps });
const Variant = sequelize.define('Variant', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, company_id: DataTypes.BIGINT.UNSIGNED,
  parent_option_id: DataTypes.BIGINT.UNSIGNED,
  name: DataTypes.STRING(100), selection_type: DataTypes.ENUM('single', 'multiple'), required: DataTypes.BOOLEAN,
  min_selections: DataTypes.TINYINT.UNSIGNED, max_selections: DataTypes.TINYINT.UNSIGNED, status: DataTypes.ENUM('active', 'inactive')
}, { tableName: 'variants', ...timestamps });
const VariantOption = sequelize.define('VariantOption', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, variant_id: DataTypes.BIGINT.UNSIGNED,
  name: DataTypes.STRING(100), status: DataTypes.ENUM('active', 'inactive'), sort_order: DataTypes.SMALLINT.UNSIGNED
}, { tableName: 'variant_options', ...timestamps });
const ProductVariant = sequelize.define('ProductVariant', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, product_id: DataTypes.BIGINT.UNSIGNED, variant_id: DataTypes.BIGINT.UNSIGNED, sort_order: DataTypes.SMALLINT.UNSIGNED
}, { tableName: 'product_variants', createdAt: 'created_at', updatedAt: false });
const ProductVariantOptionPrice = sequelize.define('ProductVariantOptionPrice', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  variant_option_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  additional_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }
}, { tableName: 'product_variant_option_prices', ...timestamps });
const CustomerAddress = sequelize.define('CustomerAddress', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, customer_id: DataTypes.BIGINT.UNSIGNED,
  label: DataTypes.STRING(80), recipient_name: DataTypes.STRING(150), recipient_phone: DataTypes.STRING(30),
  address_line: DataTypes.STRING(500), additional_details: DataTypes.STRING(500), neighborhood: DataTypes.STRING(150), city: DataTypes.STRING(100),
  latitude: DataTypes.DECIMAL(10, 7), longitude: DataTypes.DECIMAL(10, 7), is_default: DataTypes.BOOLEAN, deleted_at: DataTypes.DATE
}, { tableName: 'customer_addresses', ...timestamps, paranoid: true, deletedAt: 'deleted_at' });
const Cart = sequelize.define('Cart', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, customer_id: DataTypes.BIGINT.UNSIGNED, company_id: DataTypes.BIGINT.UNSIGNED, coupon_id: DataTypes.BIGINT.UNSIGNED
}, { tableName: 'carts', ...timestamps });
const CartItem = sequelize.define('CartItem', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, cart_id: DataTypes.BIGINT.UNSIGNED, product_id: DataTypes.BIGINT.UNSIGNED,
  quantity: DataTypes.INTEGER.UNSIGNED, unit_base_price: DataTypes.DECIMAL(12, 2), customer_notes: DataTypes.STRING(500)
}, { tableName: 'cart_items', ...timestamps });
const CartItemVariant = sequelize.define('CartItemVariant', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, cart_item_id: DataTypes.BIGINT.UNSIGNED, variant_option_id: DataTypes.BIGINT.UNSIGNED, additional_price: DataTypes.DECIMAL(12, 2)
}, { tableName: 'cart_item_variants', createdAt: 'created_at', updatedAt: false });
const CartItemIngredient = sequelize.define('CartItemIngredient', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, cart_item_id: DataTypes.BIGINT.UNSIGNED, ingredient_id: DataTypes.BIGINT.UNSIGNED, action: DataTypes.ENUM('remove')
}, { tableName: 'cart_item_ingredients', createdAt: 'created_at', updatedAt: false });
const Order = sequelize.define('Order', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_number: DataTypes.STRING(40), customer_id: DataTypes.BIGINT.UNSIGNED,
  company_id: DataTypes.BIGINT.UNSIGNED, address_id: DataTypes.BIGINT.UNSIGNED, subtotal: DataTypes.DECIMAL(12, 2), delivery_fee: DataTypes.DECIMAL(12, 2), discount: DataTypes.DECIMAL(12, 2), total: DataTypes.DECIMAL(12, 2), commission_amount: DataTypes.DECIMAL(12, 2), coupon_id: DataTypes.BIGINT.UNSIGNED,
  payment_method: DataTypes.ENUM('cash', 'pse'), payment_status: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), order_status: DataTypes.ENUM('pending', 'accepted', 'preparing', 'waiting_delivery', 'on_the_way', 'delivered', 'rejected', 'cancelled'), delivery_code: DataTypes.STRING(12), rejection_reason: DataTypes.STRING(500), customer_notes: DataTypes.STRING(500)
}, { tableName: 'orders', ...timestamps });
const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_id: DataTypes.BIGINT.UNSIGNED, product_id: DataTypes.BIGINT.UNSIGNED,
  product_name: DataTypes.STRING(180), unit_base_price: DataTypes.DECIMAL(12, 2), quantity: DataTypes.INTEGER.UNSIGNED, variants_total: DataTypes.DECIMAL(12, 2), line_total: DataTypes.DECIMAL(12, 2), customer_notes: DataTypes.STRING(500)
}, { tableName: 'order_items', createdAt: 'created_at', updatedAt: false });
const OrderItemVariant = sequelize.define('OrderItemVariant', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_item_id: DataTypes.BIGINT.UNSIGNED, variant_name: DataTypes.STRING(100), option_name: DataTypes.STRING(100), additional_price: DataTypes.DECIMAL(12, 2)
}, { tableName: 'order_item_variants', createdAt: 'created_at', updatedAt: false });
const OrderItemIngredient = sequelize.define('OrderItemIngredient', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_item_id: DataTypes.BIGINT.UNSIGNED, ingredient_name: DataTypes.STRING(120), action: DataTypes.ENUM('remove')
}, { tableName: 'order_item_ingredients', createdAt: 'created_at', updatedAt: false });
const OrderStatusHistory = sequelize.define('OrderStatusHistory', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_id: DataTypes.BIGINT.UNSIGNED, status: DataTypes.STRING(40), changed_by_user_id: DataTypes.BIGINT.UNSIGNED, notes: DataTypes.STRING(500)
}, { tableName: 'order_status_history', createdAt: 'created_at', updatedAt: false });
const CompanyReview = sequelize.define('CompanyReview', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, company_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, customer_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false }, comment: DataTypes.STRING(1000)
}, { tableName: 'company_reviews', ...timestamps });
const DeliveryDriver = sequelize.define('DeliveryDriver', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  vehicle_type: DataTypes.ENUM('bicycle', 'motorcycle', 'car', 'other'), vehicle_plate: DataTypes.STRING(20),
  availability_status: DataTypes.ENUM('offline', 'available', 'busy', 'suspended'), current_latitude: DataTypes.DECIMAL(10, 7), current_longitude: DataTypes.DECIMAL(10, 7), location_updated_at: DataTypes.DATE
}, { tableName: 'delivery_drivers', ...timestamps });
const Delivery = sequelize.define('Delivery', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, driver_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  delivery_fee: DataTypes.DECIMAL(12, 2), driver_payment: DataTypes.DECIMAL(12, 2), status: DataTypes.ENUM('assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'cancelled'), accepted_at: DataTypes.DATE, picked_up_at: DataTypes.DATE, delivered_at: DataTypes.DATE
}, { tableName: 'deliveries', ...timestamps });
const Coupon = sequelize.define('Coupon', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, code: DataTypes.STRING(60), discount_type: DataTypes.ENUM('percentage', 'fixed'), discount_value: DataTypes.DECIMAL(12, 2), max_discount: DataTypes.DECIMAL(12, 2), minimum_order_amount: DataTypes.DECIMAL(12, 2), starts_at: DataTypes.DATE, expires_at: DataTypes.DATE, usage_limit: DataTypes.INTEGER.UNSIGNED, usage_count: DataTypes.INTEGER.UNSIGNED, per_user_limit: DataTypes.INTEGER.UNSIGNED, company_id: DataTypes.BIGINT.UNSIGNED, category_id: DataTypes.BIGINT.UNSIGNED, status: DataTypes.ENUM('active', 'inactive')
}, { tableName: 'coupons', ...timestamps });
const CouponUsage = sequelize.define('CouponUsage', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, coupon_id: DataTypes.BIGINT.UNSIGNED, user_id: DataTypes.BIGINT.UNSIGNED, order_id: DataTypes.BIGINT.UNSIGNED, discount_amount: DataTypes.DECIMAL(12, 2)
}, { tableName: 'coupon_usages', createdAt: 'created_at', updatedAt: false });
const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, order_id: DataTypes.BIGINT.UNSIGNED, method: DataTypes.ENUM('cash', 'pse'), status: DataTypes.ENUM('pending', 'paid', 'failed', 'cancelled', 'refunded'), amount: DataTypes.DECIMAL(12, 2), provider: DataTypes.STRING(100), provider_reference: DataTypes.STRING(191), provider_response: DataTypes.JSON, paid_at: DataTypes.DATE
}, { tableName: 'payments', ...timestamps });
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, type: DataTypes.STRING(80), title: DataTypes.STRING(191), message: DataTypes.TEXT, data: DataTypes.JSON, read_at: DataTypes.DATE
}, { tableName: 'notifications', createdAt: 'created_at', updatedAt: false });
const PushToken = sequelize.define('PushToken', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  token: { type: DataTypes.STRING(255), allowNull: false },
  platform: DataTypes.ENUM('ios', 'android'),
  app_scope: DataTypes.ENUM('customer', 'driver'),
  device_name: DataTypes.STRING(120),
  last_seen_at: DataTypes.DATE
}, { tableName: 'push_tokens', ...timestamps });
const Popup = sequelize.define('Popup', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  title: DataTypes.STRING(180), message: DataTypes.STRING(500), image_url: DataTypes.STRING(500), link_url: DataTypes.STRING(500),
  display_order: DataTypes.SMALLINT.UNSIGNED, starts_at: DataTypes.DATE, ends_at: DataTypes.DATE, status: DataTypes.ENUM('active', 'inactive')
}, { tableName: 'popups', ...timestamps });
const HomePromotion = sequelize.define('HomePromotion', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  title: DataTypes.STRING(180), message: DataTypes.STRING(500), image_url: DataTypes.STRING(500), link_url: DataTypes.STRING(500),
  display_order: DataTypes.SMALLINT.UNSIGNED, starts_at: DataTypes.DATE, ends_at: DataTypes.DATE, status: DataTypes.ENUM('active', 'inactive')
}, { tableName: 'home_promotions', ...timestamps });
const PlatformSetting = sequelize.define('PlatformSetting', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  key: { type: DataTypes.STRING(120), allowNull: false },
  value_json: DataTypes.JSON
}, { tableName: 'platform_settings', ...timestamps });
const Professional = sequelize.define('Professional', { id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, company_id: DataTypes.BIGINT.UNSIGNED, user_id: DataTypes.BIGINT.UNSIGNED, name: DataTypes.STRING(150), specialty: DataTypes.STRING(150), phone: DataTypes.STRING(30), email: DataTypes.STRING(191), photo: DataTypes.STRING(500), description: DataTypes.TEXT, status: DataTypes.ENUM('active', 'inactive') }, { tableName: 'professionals', ...timestamps });
const Service = sequelize.define('Service', { id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, company_id: DataTypes.BIGINT.UNSIGNED, name: DataTypes.STRING(180), description: DataTypes.TEXT, duration_minutes: DataTypes.SMALLINT.UNSIGNED, price: DataTypes.DECIMAL(12, 2), status: DataTypes.ENUM('active', 'inactive') }, { tableName: 'services', ...timestamps });
const ServiceProfessional = sequelize.define('ServiceProfessional', { id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, service_id: DataTypes.BIGINT.UNSIGNED, professional_id: DataTypes.BIGINT.UNSIGNED }, { tableName: 'service_professionals', createdAt: 'created_at', updatedAt: false });
const ProfessionalSchedule = sequelize.define('ProfessionalSchedule', { id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, professional_id: DataTypes.BIGINT.UNSIGNED, day_of_week: DataTypes.TINYINT.UNSIGNED, start_time: DataTypes.TIME, end_time: DataTypes.TIME, status: DataTypes.ENUM('active', 'inactive') }, { tableName: 'professional_schedules', ...timestamps });
const Appointment = sequelize.define('Appointment', { id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, appointment_number: DataTypes.STRING(40), customer_id: DataTypes.BIGINT.UNSIGNED, company_id: DataTypes.BIGINT.UNSIGNED, service_id: DataTypes.BIGINT.UNSIGNED, professional_id: DataTypes.BIGINT.UNSIGNED, address_id: DataTypes.BIGINT.UNSIGNED, scheduled_date: DataTypes.DATEONLY, start_time: DataTypes.TIME, end_time: DataTypes.TIME, price: DataTypes.DECIMAL(12, 2), status: DataTypes.ENUM('pending', 'accepted', 'completed', 'cancelled'), customer_notes: DataTypes.STRING(500) }, { tableName: 'appointments', ...timestamps });

User.belongsTo(Role, { as: 'platformRole', foreignKey: 'role_id' });
Role.hasMany(User, { as: 'users', foreignKey: 'role_id' });
Role.belongsToMany(Permission, { as: 'permissions', through: RolePermission, foreignKey: 'role_id', otherKey: 'permission_id' });
Permission.belongsToMany(Role, { as: 'roles', through: RolePermission, foreignKey: 'permission_id', otherKey: 'role_id' });
User.hasMany(AuthRefreshToken, { foreignKey: 'user_id' });
User.hasMany(PasswordResetToken, { foreignKey: 'user_id' });
User.hasMany(UserLegalAcceptance, { foreignKey: 'user_id' });
CompanyUser.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
CompanyUser.belongsTo(Company, { as: 'company', foreignKey: 'company_id' });
CompanyUser.belongsToMany(Role, { as: 'companyRoles', through: CompanyUserRole, foreignKey: 'company_user_id', otherKey: 'role_id' });
Company.hasMany(CompanyUser, { as: 'team', foreignKey: 'company_id' });
Company.hasOne(CompanyWallet, { as: 'wallet', foreignKey: 'company_id' });
CompanyWallet.belongsTo(Company, { as: 'company', foreignKey: 'company_id' });
CompanyWallet.hasMany(WalletTransaction, { as: 'transactions', foreignKey: 'company_wallet_id' });
WalletTransaction.belongsTo(CompanyWallet, { as: 'wallet', foreignKey: 'company_wallet_id' });
WalletTransaction.belongsTo(Company, { as: 'company', foreignKey: 'company_id' });
Company.hasMany(CompanySettlement, { as: 'settlements', foreignKey: 'company_id' });
CompanySettlement.belongsTo(Company, { as: 'company', foreignKey: 'company_id' });
CompanySettlement.hasMany(CompanySettlementItem, { as: 'items', foreignKey: 'settlement_id' });
CompanySettlementItem.belongsTo(CompanySettlement, { as: 'settlement', foreignKey: 'settlement_id' });
CompanySettlementItem.belongsTo(Order, { as: 'order', foreignKey: 'order_id' });
CompanySettlementItem.belongsTo(Payment, { as: 'payment', foreignKey: 'payment_id' });
Company.hasMany(Product, { as: 'products', foreignKey: 'company_id' }); Product.belongsTo(Company, { as: 'company', foreignKey: 'company_id' });
Category.hasMany(Product, { as: 'products', foreignKey: 'category_id' }); Product.belongsTo(Category, { as: 'category', foreignKey: 'category_id' });
Product.hasMany(ProductImage, { as: 'images', foreignKey: 'product_id' }); ProductImage.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(ProductIngredient, { as: 'ingredients', foreignKey: 'product_id' }); ProductIngredient.belongsTo(Product, { as: 'product', foreignKey: 'product_id' });
Company.hasMany(Variant, { as: 'variants', foreignKey: 'company_id' }); Variant.belongsTo(Company, { foreignKey: 'company_id' });
Variant.hasMany(VariantOption, { as: 'options', foreignKey: 'variant_id' }); VariantOption.belongsTo(Variant, { foreignKey: 'variant_id' });
VariantOption.hasMany(Variant, { as: 'childVariants', foreignKey: 'parent_option_id' }); Variant.belongsTo(VariantOption, { as: 'parentOption', foreignKey: 'parent_option_id' });
Product.belongsToMany(Variant, { as: 'variants', through: ProductVariant, foreignKey: 'product_id', otherKey: 'variant_id' });
Variant.belongsToMany(Product, { as: 'products', through: ProductVariant, foreignKey: 'variant_id', otherKey: 'product_id' });
Product.hasMany(ProductVariantOptionPrice, { as: 'variantOptionPrices', foreignKey: 'product_id' });
ProductVariantOptionPrice.belongsTo(Product, { as: 'product', foreignKey: 'product_id' });
VariantOption.hasMany(ProductVariantOptionPrice, { as: 'productPrices', foreignKey: 'variant_option_id' });
ProductVariantOptionPrice.belongsTo(VariantOption, { as: 'option', foreignKey: 'variant_option_id' });
User.hasMany(CustomerAddress, { as: 'addresses', foreignKey: 'customer_id' }); CustomerAddress.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' });
User.hasOne(Cart, { as: 'cart', foreignKey: 'customer_id' }); Cart.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' }); Cart.belongsTo(Company, { as: 'company', foreignKey: 'company_id' });
Cart.belongsTo(Coupon, { as: 'coupon', foreignKey: 'coupon_id' }); Coupon.belongsTo(Company, { as: 'company', foreignKey: 'company_id' }); Coupon.belongsTo(Category, { as: 'category', foreignKey: 'category_id' });
Cart.hasMany(CartItem, { as: 'items', foreignKey: 'cart_id' }); CartItem.belongsTo(Cart, { foreignKey: 'cart_id' }); CartItem.belongsTo(Product, { as: 'product', foreignKey: 'product_id' });
CartItem.hasMany(CartItemVariant, { as: 'variants', foreignKey: 'cart_item_id' }); CartItemVariant.belongsTo(VariantOption, { as: 'option', foreignKey: 'variant_option_id' });
CartItem.hasMany(CartItemIngredient, { as: 'ingredientAdjustments', foreignKey: 'cart_item_id' }); CartItemIngredient.belongsTo(ProductIngredient, { as: 'ingredient', foreignKey: 'ingredient_id' });
Order.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' }); Order.belongsTo(Company, { as: 'company', foreignKey: 'company_id' }); Order.belongsTo(CustomerAddress, { as: 'address', foreignKey: 'address_id' });
CompanyReview.belongsTo(Order, { as: 'order', foreignKey: 'order_id' }); CompanyReview.belongsTo(Company, { as: 'company', foreignKey: 'company_id' }); CompanyReview.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' }); Order.hasOne(CompanyReview, { as: 'review', foreignKey: 'order_id' }); Company.hasMany(CompanyReview, { as: 'reviews', foreignKey: 'company_id' });
Order.hasMany(OrderItem, { as: 'items', foreignKey: 'order_id' }); OrderItem.belongsTo(Order, { foreignKey: 'order_id' }); OrderItem.hasMany(OrderItemVariant, { as: 'variants', foreignKey: 'order_item_id' }); OrderItem.hasMany(OrderItemIngredient, { as: 'ingredientAdjustments', foreignKey: 'order_item_id' }); Order.hasMany(OrderStatusHistory, { as: 'history', foreignKey: 'order_id' }); OrderStatusHistory.belongsTo(User, { as: 'changedBy', foreignKey: 'changed_by_user_id' });
User.hasOne(DeliveryDriver, { as: 'deliveryDriver', foreignKey: 'user_id' }); DeliveryDriver.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
Delivery.belongsTo(Order, { as: 'order', foreignKey: 'order_id' }); Delivery.belongsTo(DeliveryDriver, { as: 'driver', foreignKey: 'driver_id' }); Order.hasOne(Delivery, { as: 'delivery', foreignKey: 'order_id' });
Order.belongsTo(Coupon, { as: 'coupon', foreignKey: 'coupon_id' }); Order.hasOne(Payment, { as: 'payment', foreignKey: 'order_id' }); Payment.belongsTo(Order, { as: 'order', foreignKey: 'order_id' }); CouponUsage.belongsTo(Coupon, { as: 'coupon', foreignKey: 'coupon_id' });
Notification.belongsTo(User, { as: 'user', foreignKey: 'user_id' }); User.hasMany(Notification, { as: 'notifications', foreignKey: 'user_id' });
PushToken.belongsTo(User, { as: 'user', foreignKey: 'user_id' }); User.hasMany(PushToken, { as: 'pushTokens', foreignKey: 'user_id' });
Company.hasMany(Professional, { as: 'professionals', foreignKey: 'company_id' }); Professional.belongsTo(Company, { as: 'company', foreignKey: 'company_id' }); Professional.belongsTo(User, { as: 'user', foreignKey: 'user_id' }); User.hasOne(Professional, { as: 'professionalProfile', foreignKey: 'user_id' }); Company.hasMany(Service, { as: 'services', foreignKey: 'company_id' }); Service.belongsTo(Company, { as: 'company', foreignKey: 'company_id' }); Service.belongsToMany(Professional, { as: 'professionals', through: ServiceProfessional, foreignKey: 'service_id', otherKey: 'professional_id' }); Professional.belongsToMany(Service, { as: 'services', through: ServiceProfessional, foreignKey: 'professional_id', otherKey: 'service_id' }); Professional.hasMany(ProfessionalSchedule, { as: 'schedules', foreignKey: 'professional_id' }); Company.hasMany(Appointment, { as: 'appointments', foreignKey: 'company_id' }); Appointment.belongsTo(Company, { as: 'company', foreignKey: 'company_id' }); Appointment.belongsTo(Service, { as: 'service', foreignKey: 'service_id' }); Appointment.belongsTo(Professional, { as: 'professional', foreignKey: 'professional_id' }); Appointment.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' });

module.exports = { sequelize, Role, User, AuthRefreshToken, PasswordResetToken, EmailVerificationCode, UserLegalAcceptance, Permission, RolePermission, Company, CompanyWallet, WalletTransaction, CompanySettlement, CompanySettlementItem, AuditLog, CompanyUser, CompanyUserRole, Category, Product, ProductImage, ProductIngredient, Variant, VariantOption, ProductVariant, ProductVariantOptionPrice, CustomerAddress, Cart, CartItem, CartItemVariant, CartItemIngredient, Order, OrderItem, OrderItemVariant, OrderItemIngredient, OrderStatusHistory, CompanyReview, DeliveryDriver, Delivery, Coupon, CouponUsage, Payment, Notification, PushToken, Popup, HomePromotion, PlatformSetting, Professional, Service, ServiceProfessional, ProfessionalSchedule, Appointment };
