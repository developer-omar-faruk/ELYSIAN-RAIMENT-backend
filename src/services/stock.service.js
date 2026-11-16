import { Product } from '../models/catalog.js';
import { StockMovement } from '../models/commerce.js';

// Atomically changes stock. Decrements only succeed when enough stock exists. Returns true when applied.
export async function adjustStock({ productRef, variantId, delta, session, trackSold = false }) {
  const filter = { _id: productRef };
  const inc = { stock: delta };
  if (trackSold) inc.sold = -delta;
  if (variantId) {
    filter.variants = { $elemMatch: { _id: variantId, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) } };
    inc['variants.$.stock'] = delta;
  } else if (delta < 0) {
    filter.stock = { $gte: -delta };
  }
  const r = await Product.updateOne(filter, { $inc: inc }, { session });
  return r.modifiedCount === 1;
}

export const logMovement = (doc, session) => StockMovement.create([doc], { session });