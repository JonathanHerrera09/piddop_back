const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const { Coupon, CouponUsage } = require('../models');

async function validateCoupon({ coupon, userId, cart, subtotal, categoryIds, transaction }) {
  const now = new Date();
  if (!coupon || coupon.status !== 'active' || (coupon.starts_at && coupon.starts_at > now) || (coupon.expires_at && coupon.expires_at < now)) throw new AppError('Coupon is not valid', 422);
  if (coupon.company_id && String(coupon.company_id) !== String(cart.company_id)) throw new AppError('Coupon is not valid for this company', 422);
  if (coupon.category_id && !categoryIds.every((id) => String(id) === String(coupon.category_id))) throw new AppError('Coupon requires products from its configured category', 422);
  if (Number(subtotal) < Number(coupon.minimum_order_amount)) throw new AppError('Cart does not meet the coupon minimum amount', 422);
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) throw new AppError('Coupon usage limit has been reached', 422);
  const uses = await CouponUsage.count({ where: { coupon_id: coupon.id, user_id: userId }, transaction });
  if (uses >= coupon.per_user_limit) throw new AppError('Coupon usage limit per user has been reached', 422);
  let discount = coupon.discount_type === 'percentage' ? Number(subtotal) * Number(coupon.discount_value) / 100 : Number(coupon.discount_value);
  if (coupon.discount_type === 'percentage' && coupon.max_discount !== null) discount = Math.min(discount, Number(coupon.max_discount));
  return Math.min(discount, Number(subtotal));
}

async function findValidCoupon(code, transaction) {
  const coupon = await Coupon.findOne({ where: { code: String(code).trim().toUpperCase() }, transaction, lock: transaction?.LOCK?.UPDATE });
  if (!coupon) throw new AppError('Coupon not found', 404);
  return coupon;
}

module.exports = { validateCoupon, findValidCoupon };
