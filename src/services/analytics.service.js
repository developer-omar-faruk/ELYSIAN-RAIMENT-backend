import { Category, Product } from '../models/catalog.js';
import { Order } from '../models/commerce.js';
import { env } from '../config/env.js';
import { dayEnd, dayStart } from '../utils/helpers.js';
import { NOT_REVENUE, STATUSES } from '../utils/constants.js';
import { lowThreshold } from './settings.service.js';

const FMT = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: env.STORE_TZ });

export async function analytics({ from, to, group }) {
  const toD = to || ymd(new Date());
  const fromD = from || ymd(new Date(Date.now() - 29 * 864e5));
  const range = { $gte: dayStart(fromD), $lte: dayEnd(toD) };
  const live = { createdAt: range, status: { $nin: NOT_REVENUE } };
  const threshold = await lowThreshold();

  const [series, statusAgg, topProducts, catAgg, cats, productAgg, customersAgg, recent, lowList] = await Promise.all([
    Order.aggregate([{ $match: live }, { $group: { _id: { $dateToString: { format: FMT[group], date: '$createdAt', timezone: env.STORE_TZ } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: { createdAt: range } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: live }, { $unwind: '$items' }, { $group: { _id: '$items.productId', name: { $first: '$items.name' }, image: { $first: '$items.image' }, qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } }, { $sort: { qty: -1 } }, { $limit: 10 }]),
    Order.aggregate([{ $match: live }, { $unwind: '$items' }, { $group: { _id: '$items.category', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } }, { $sort: { revenue: -1 } }, { $limit: 10 }]),
    Category.find({}).select('slug name').lean(),
    Product.aggregate([{ $group: { _id: null, products: { $sum: 1 }, units: { $sum: '$stock' }, out: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } }, low: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', threshold] }] }, 1, 0] } } } }]),
    Order.aggregate([{ $group: { _id: '$customer.phone', n: { $sum: 1 }, first: { $min: '$createdAt' } } }]),
    Order.find({ createdAt: range }).sort({ createdAt: -1 }).limit(8).lean(),
    Product.find({ stock: { $lte: threshold } }).sort({ stock: 1 }).limit(8).select('id name stock').lean(),
  ]);

  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  statusAgg.forEach((s) => { statusCounts[s._id] = s.n; });
  const revenue = series.reduce((s, x) => s + x.revenue, 0);
  const liveOrders = series.reduce((s, x) => s + x.orders, 0);
  const pa = productAgg[0] || { products: 0, units: 0, out: 0, low: 0 };
  const catName = Object.fromEntries(cats.map((c) => [c.slug, c.name]));
  const rangeStart = range.$gte;

  return {
    totals: { revenue, orders: Object.values(statusCounts).reduce((a, b) => a + b, 0), products: pa.products, customers: customersAgg.length, statusCounts, aov: liveOrders ? Math.round(revenue / liveOrders) : 0, cancelled: statusCounts.Cancelled },
    inventory: { low: pa.low, out: pa.out, units: pa.units, lowList },
    series,
    recent: recent.map((o) => ({ id: o.id, customer: { name: o.customer.name }, total: o.total, status: o.status })),
    topProducts,
    topCategories: catAgg.map((c) => ({ slug: c._id, name: catName[c._id] || c._id, qty: c.qty, revenue: c.revenue })),
    customers: { total: customersAgg.length, newInRange: customersAgg.filter((c) => c.first >= rangeStart && c.first <= range.$lte).length, returning: customersAgg.filter((c) => c.n > 1).length },
  };
}