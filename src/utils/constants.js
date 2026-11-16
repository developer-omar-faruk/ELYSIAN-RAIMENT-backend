export const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Completed', 'Cancelled', 'Refunded'];
export const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Refunded'];

// Allowed order status transitions. Cancelled and Refunded are terminal.
export const TRANSITIONS = {
  Pending: ['Confirmed', 'Processing', 'Cancelled'],
  Confirmed: ['Processing', 'Shipped', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: ['Completed', 'Refunded'],
  Completed: ['Refunded'],
  Cancelled: [],
  Refunded: [],
};

// The storefront timeline has 4 steps: Order Placed, Processing, Shipped, Delivered
export const statusIndex = (s) => ({ Pending: 0, Confirmed: 0, Processing: 1, Shipped: 2, Delivered: 3, Completed: 3, Refunded: 3 }[s] ?? 0);
export const NOT_REVENUE = ['Cancelled', 'Refunded'];