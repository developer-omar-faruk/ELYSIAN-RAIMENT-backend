import { Coupon } from '../models/commerce.js';
import { HttpError } from '../utils/errors.js';
import { todayStr } from '../utils/helpers.js';

const taka = (n) => `৳${Math.round(n).toLocaleString('en-US')}`;

export async function evalCoupon(code, subtotal, session = null) {
  const c = await Coupon.findOne({ code: String(code).trim().toUpperCase() }).session(session);
  const today = todayStr();
  if (!c || !c.active) throw new HttpError(400, 'That coupon code is not valid.');
  if (c.startsAt && c.startsAt > today) throw new HttpError(400, 'That coupon is not active yet.');
  if (c.expiresAt && c.expiresAt < today) throw new HttpError(400, 'That coupon has expired.');
  if (c.minOrder && subtotal < c.minOrder) throw new HttpError(400, `This coupon needs a minimum order of ${taka(c.minOrder)}.`);
  if (c.usageLimit && c.used >= c.usageLimit) throw new HttpError(400, 'This coupon has reached its usage limit.');
  let amount = c.type === 'percent' ? Math.floor((subtotal * c.value) / 100) : c.value;
  if (c.type === 'percent' && c.maxDiscount) amount = Math.min(amount, c.maxDiscount);
  amount = Math.max(0, Math.min(amount, subtotal));
  return { id: c._id, code: c.code, type: c.type, value: amount, label: c.type === 'percent' ? `${c.value}% off your order` : `${taka(c.value)} off your order` };
}