import mongoose from 'mongoose';
import { STATUSES, PAYMENT_STATUSES } from '../utils/constants.js';
const { Schema, model } = mongoose;

const itemSchema = new Schema({
  productId: String,
  productRef: Schema.Types.ObjectId,
  variantId: Schema.Types.ObjectId,
  category: String,
  name: String,
  size: String,
  color: { type: String, default: '' },
  price: Number,
  qty: Number,
  image: String,
}, { _id: false });

const orderSchema = new Schema({
  id: { type: String, required: true, unique: true },
  idemKey: { type: String, unique: true, sparse: true },
  fingerprint: { type: String, index: true },
  customer: { name: String, phone: { type: String, index: true }, email: { type: String, default: '' } },
  address: String,
  area: { type: String, default: '' },
  note: { type: String, default: '' },
  zone: String,
  zoneId: String,
  items: { type: [itemSchema], validate: (v) => v.length > 0 },
  subtotal: { type: Number, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  coupon: { type: String, default: '' },
  deliveryFee: { type: Number, default: 0, min: 0 },
  total: { type: Number, min: 0 },
  payment: { type: String, default: 'Cash on Delivery' },
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'Unpaid' },
  status: { type: String, enum: STATUSES, default: 'Pending', index: true },
  stockRestored: { type: Boolean, default: false },
  notes: [{ _id: false, text: String, by: String, at: { type: Date, default: Date.now } }],
  timeline: [{ _id: false, label: String, by: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true });
orderSchema.index({ createdAt: -1 });
export const Order = model('Order', orderSchema);

const couponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['percent', 'flat'], required: true },
  value: { type: Number, required: true, min: 1 },
  minOrder: { type: Number, default: 0, min: 0 },
  maxDiscount: { type: Number, default: 0, min: 0 },
  startsAt: { type: String, default: '' },
  expiresAt: { type: String, default: '' },
  usageLimit: { type: Number, default: 0, min: 0 },
  used: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Coupon = model('Coupon', couponSchema);

const reviewSchema = new Schema({
  name: { type: String, required: true },
  city: { type: String, default: '' },
  rating: { type: Number, min: 1, max: 5, required: true },
  text: { type: String, required: true },
  image: { type: String, default: '' },
  productId: String,
  productName: String,
  approved: { type: Boolean, default: true },
}, { timestamps: true });
reviewSchema.index({ approved: 1, createdAt: -1 });
export const Review = model('Review', reviewSchema);

const movementSchema = new Schema({
  productId: String,
  name: String,
  size: String,
  color: String,
  delta: Number,
  after: Number,
  reason: String,
  by: String,
  orderId: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
movementSchema.index({ createdAt: -1 });
export const StockMovement = model('StockMovement', movementSchema);