import { Product } from '../models/catalog.js';
import { Coupon, Order } from '../models/commerce.js';
import { HttpError } from '../utils/errors.js';
import { newOrderId, sha256 } from '../utils/helpers.js';
import { STATUSES, TRANSITIONS, statusIndex } from '../utils/constants.js';
import { atomic } from '../utils/tx.js';
import { getSettings } from './settings.service.js';
import { evalCoupon } from './coupon.service.js';
import { adjustStock, logMovements } from './stock.service.js';
import { invalidateBootstrapCache } from './bootstrap-cache.js';

// ---------- Shapes ----------
export const storefrontOrder = (o) => ({
  id: o.id, date: o.createdAt, customer: { name: o.customer.name }, total: o.total, payment: o.payment,
  address: o.address, area: o.area, zone: o.zone,
  items: o.items.map((i) => ({ id: i.productId, name: i.name, size: i.size, color: i.color, qty: i.qty, image: i.image })),
  status: statusIndex(o.status), cancelled: o.status === 'Cancelled',
});
export const adminOrder = (o) => ({
  id: o.id, createdAt: o.createdAt, customer: o.customer, address: o.address, area: o.area, zone: o.zone, note: o.note,
  items: o.items.map((i) => ({ id: i.productId, name: i.name, size: i.size, color: i.color, price: i.price, qty: i.qty, image: i.image })),
  subtotal: o.subtotal, discount: o.discount, coupon: o.coupon, deliveryFee: o.deliveryFee, total: o.total,
  payment: o.payment, paymentStatus: o.paymentStatus, status: o.status,
  notes: o.notes || [], timeline: o.timeline || [],
});

// ---------- Create ----------
async function findDuplicate(idemKey, fingerprint) {
  if (idemKey) {
    const hit = await Order.findOne({ idemKey });
    if (hit && hit.fingerprint !== fingerprint) throw new HttpError(409, 'This Idempotency-Key was already used with a different order.');
    return hit;
  }
  return Order.findOne({ fingerprint, createdAt: { $gt: new Date(Date.now() - 30_000) } });
}

export async function createOrder(input, { idemKey } = {}) {
  const settings = await getSettings();
  const zone = settings.zones.find((z) => z.id === input.zone);
  if (!zone) throw new HttpError(400, 'Please select a valid delivery zone.');

  const merged = new Map();
  for (const it of input.items) {
    const color = it.color === 'Default' ? '' : it.color;
    const k = `${it.id}|${it.size}|${color}`;
    const ex = merged.get(k);
    merged.set(k, { id: it.id, size: it.size, color, qty: (ex?.qty || 0) + it.qty });
  }
  const lines = [...merged.values()];
  if (lines.some((l) => l.qty > 20)) throw new HttpError(400, 'Maximum 20 of one item per order.');
  const fingerprint = sha256([input.customer.phone, zone.id, input.coupon.toUpperCase(), ...lines.map((l) => `${l.id}|${l.size}|${l.color}|${l.qty}`).sort()].join('~'));

  const dup = await findDuplicate(idemKey, fingerprint);
  if (dup) return { order: dup, duplicate: true };

  try {
    const order = await atomic(async (session, undo) => {
      const items = [];
      let subtotal = 0;
      const products = await Product.find({ id: { $in: lines.map((l) => l.id) }, published: true })
        .select('id category name sizes colors variants price images')
        .session(session)
        .lean();
      const productsById = new Map(products.map((p) => [p.id, p]));

      for (const l of lines) {
        const p = productsById.get(l.id);
        if (!p) throw new HttpError(400, 'An item in your cart is no longer available.');
        if (!p.sizes.includes(l.size)) throw new HttpError(400, `Size ${l.size} is not available for ${p.name}.`);
        if (l.color && !p.colors.includes(l.color)) throw new HttpError(400, `Colour ${l.color} is not available for ${p.name}.`);
        if (!l.color && p.colors.length && !p.colors.includes('Default')) throw new HttpError(400, `Please choose a colour for ${p.name}.`);
        let variantId;
        if (p.variants.length) {
          const v = p.variants.find((x) => x.size === l.size && (x.color || '') === l.color);
          if (!v) throw new HttpError(400, `That size/colour combination is unavailable for ${p.name}.`);
          variantId = v._id;
        }
        const ok = await adjustStock({ productRef: p._id, variantId, delta: -l.qty, session, trackSold: true });
        if (!ok) throw new HttpError(409, `Sorry, ${p.name} does not have enough stock left.`);
        undo.push(() => adjustStock({ productRef: p._id, variantId, delta: l.qty, trackSold: true }));
        items.push({ productId: p.id, productRef: p._id, variantId, category: p.category, name: p.name, size: l.size, color: l.color, price: p.price, qty: l.qty, image: p.images[0] || '' });
        subtotal += p.price * l.qty;
      }

      let discount = 0, couponCode = '';
      if (input.coupon) {
        const c = await evalCoupon(input.coupon, subtotal, session);
        const r = await Coupon.updateOne(
          { _id: c.id, active: true, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$used', '$usageLimit'] } }] },
          { $inc: { used: 1 } }, { session },
        );
        if (r.modifiedCount !== 1) throw new HttpError(400, 'This coupon has reached its usage limit.');
        undo.push(() => Coupon.updateOne({ _id: c.id }, { $inc: { used: -1 } }));
        discount = c.value; couponCode = c.code;
      }

      const [created] = await Order.create([{
        id: newOrderId(), idemKey: idemKey || undefined, fingerprint,
        customer: input.customer, address: input.address, area: input.area, note: input.note,
        zone: zone.label, zoneId: zone.id, items, subtotal, discount, coupon: couponCode,
        deliveryFee: zone.fee, total: subtotal - discount + zone.fee,
        payment: 'Cash on Delivery', paymentStatus: 'Unpaid', status: 'Pending',
        timeline: [{ label: 'Order placed', by: 'customer' }],
      }], { session });

      await logMovements(items.map((it) => ({
        productId: it.productId, name: it.name, size: it.size, color: it.color,
        delta: -it.qty, reason: 'Order placed', by: 'system', orderId: created.id,
      })), session);
      return created;
    });
    invalidateBootstrapCache();
    return { order };
  } catch (e) {
    if (e.code === 11000) {
      const again = await findDuplicate(idemKey, fingerprint);
      if (again) return { order: again, duplicate: true };
    }
    throw e;
  }
}

// ---------- Admin changes ----------
async function prepareStatusChange(o, to, by, session, undo) {
  if (!STATUSES.includes(to)) throw new HttpError(400, 'Unknown status.');
  if (o.status === to) return { set: {}, timeline: [], changed: false };
  if (!(TRANSITIONS[o.status] || []).includes(to)) throw new HttpError(409, `An order cannot change from ${o.status} to ${to}.`);

  const set = { status: to };
  if (to === 'Cancelled' && !o.stockRestored) {
    const movements = [];
    for (const it of o.items) {
      if (!it.productRef) continue;
      await adjustStock({ productRef: it.productRef, variantId: it.variantId, delta: it.qty, session, trackSold: true });
      undo.push(() => adjustStock({ productRef: it.productRef, variantId: it.variantId, delta: -it.qty, trackSold: true }));
      movements.push({ productId: it.productId, name: it.name, size: it.size, color: it.color, delta: it.qty, reason: 'Order cancelled, stock restored', by, orderId: o.id });
    }
    await logMovements(movements, session);
    if (o.coupon) await Coupon.updateOne({ code: o.coupon, used: { $gt: 0 } }, { $inc: { used: -1 } }, { session });
    set.stockRestored = true;
  }
  return {
    set,
    timeline: [{ label: `Status changed from ${o.status} to ${to}`, by }],
    changed: true,
  };
}

async function saveOrderChanges(o, set, timeline, session) {
  if (!timeline.length) return o;
  const updated = await Order.findOneAndUpdate(
    { id: o.id, status: o.status, paymentStatus: o.paymentStatus },
    { $set: set, $push: { timeline: { $each: timeline } } },
    { new: true, session },
  );
  if (!updated) throw new HttpError(409, 'The order was changed by someone else. Please refresh and try again.');
  return updated;
}

export async function changeStatus(id, to, by) {
  const result = await atomic(async (session, undo) => {
    const o = await Order.findOne({ id }).session(session);
    if (!o) throw new HttpError(404, 'Order not found.');
    const statusChange = await prepareStatusChange(o, to, by, session, undo);
    return {
      order: await saveOrderChanges(o, statusChange.set, statusChange.timeline, session),
      changed: statusChange.changed,
    };
  });
  if (result.changed && to === 'Cancelled') invalidateBootstrapCache();
  return result;
}

export async function patchAdminOrder(id, changes, by) {
  const result = await atomic(async (session, undo) => {
    const o = await Order.findOne({ id }).session(session);
    if (!o) throw new HttpError(404, 'Order not found.');

    const set = {};
    const timeline = [];
    if (changes.delivery) {
      if (['Cancelled', 'Refunded', 'Completed'].includes(o.status)) throw new HttpError(409, `Delivery details cannot be edited on a ${o.status.toLowerCase()} order.`);
      set['customer.name'] = changes.delivery.name;
      set['customer.phone'] = changes.delivery.phone;
      set.address = changes.delivery.address;
      set.area = changes.delivery.area;
      set.note = changes.delivery.note;
      timeline.push({ label: 'Delivery details edited', by });
    }
    if (changes.paymentStatus && changes.paymentStatus !== o.paymentStatus) {
      if (o.status === 'Cancelled' && changes.paymentStatus === 'Paid') throw new HttpError(409, 'A cancelled order cannot be marked as paid.');
      set.paymentStatus = changes.paymentStatus;
      timeline.push({ label: `Payment marked ${changes.paymentStatus}`, by });
    }
    let statusChanged = false;
    if (changes.status) {
      const statusChange = await prepareStatusChange(o, changes.status, by, session, undo);
      Object.assign(set, statusChange.set);
      timeline.push(...statusChange.timeline);
      statusChanged = statusChange.changed;
    }

    return {
      order: await saveOrderChanges(o, set, timeline, session),
      statusChanged,
    };
  });
  if (result.statusChanged && result.order.status === 'Cancelled') invalidateBootstrapCache();
  return result;
}