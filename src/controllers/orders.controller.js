import { Order } from '../models/commerce.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { dayEnd, dayStart, escapeRegex } from '../utils/helpers.js';
import { adminOrder, changeStatus, setPaymentStatus, updateDelivery } from '../services/order.service.js';
import { notifyStatus } from '../services/email.service.js';

export const listOrders = asyncHandler(async (req, res) => {
  const { status, q, from, to, page, limit } = req.query;
  const f = {};
  if (status) f.status = status;
  if (q) { const re = new RegExp(escapeRegex(q), 'i'); f.$or = [{ id: re }, { 'customer.name': re }, { 'customer.phone': re }]; }
  if (from || to) f.createdAt = { ...(from && { $gte: dayStart(from) }), ...(to && { $lte: dayEnd(to) }) };
  const [items, total, countsAgg] = await Promise.all([
    Order.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(f),
    Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({ items: items.map(adminOrder), counts: Object.fromEntries(countsAgg.map((c) => [c._id, c.n])), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const load = async (id) => {
  const o = await Order.findOne({ id }).lean();
  if (!o) throw new HttpError(404, 'Order not found.');
  return o;
};
export const getOrder = asyncHandler(async (req, res) => res.json(adminOrder(await load(req.params.id))));

export const patchOrder = asyncHandler(async (req, res) => {
  const { status, paymentStatus, delivery } = req.body;
  const by = req.admin.email;
  const id = req.params.id;
  if (delivery) await updateDelivery(id, delivery, by);
  if (paymentStatus) await setPaymentStatus(id, paymentStatus, by);
  if (status) {
    const r = await changeStatus(id, status, by);
    if (r.changed) notifyStatus(r.order);
  }
  res.json(adminOrder(await load(id)));
});

export const addNote = asyncHandler(async (req, res) => {
  const o = await Order.findOneAndUpdate({ id: req.params.id }, { $push: { notes: { text: req.body.text, by: req.admin.email } } }, { new: true });
  if (!o) throw new HttpError(404, 'Order not found.');
  res.json(adminOrder(o));
});

export const bulkStatus = asyncHandler(async (req, res) => {
  let updated = 0;
  const failed = [];
  for (const id of req.body.ids) {
    try {
      const r = await changeStatus(id, req.body.status, req.admin.email);
      if (r.changed) { updated++; notifyStatus(r.order); }
    } catch (e) { failed.push({ id, error: e.message }); }
  }
  res.json({ updated, failed });
});