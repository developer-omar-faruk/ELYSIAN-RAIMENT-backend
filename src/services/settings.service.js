import { Settings } from '../models/system.js';

// Fallback delivery zones, identical to DELIVERY_ZONES in the storefront data.js
const DEFAULT_ZONES = [
  { id: 'dhaka', label: 'Dhaka City', fee: 40, note: 'Delivery in 1–2 working days' },
  { id: 'outside', label: 'Outside Dhaka City', fee: 50, note: 'Delivery in 3–5 working days' },
];

export async function getSettings() {
  let s = await Settings.findOne({ key: 'store' }).lean();
  if (!s) {
    try { s = (await Settings.create({ key: 'store', zones: DEFAULT_ZONES })).toObject(); }
    catch (e) { if (e.code === 11000) s = await Settings.findOne({ key: 'store' }).lean(); else throw e; }
  }
  if (!s.zones?.length) s.zones = DEFAULT_ZONES;
  return s;
}
export const lowThreshold = async () => (await getSettings()).lowStock ?? 5;