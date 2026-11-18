import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { customerOrderEmail, ownerOrderEmail, statusEmail } from '../templates/email.js';

const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function send(to, { subject, html }, tag) {
  if (!client || !env.FROM_EMAIL || !to) return;
  try {
    const { error } = await client.emails.send({ from: env.FROM_EMAIL, to, subject, html });
    logger.info({ tag, ok: !error }, 'email sent');
  } catch (e) {
    logger.warn({ tag, reason: e.message }, 'email failed');
  }
}

// Fire and forget: an email problem must never affect order creation or status changes
export function notifyNewOrder(o) {
  send(env.OWNER_EMAIL, ownerOrderEmail(o), 'order-owner');
  if (o.customer.email) send(o.customer.email, customerOrderEmail(o), 'order-customer');
}
export function notifyStatus(o) {
  if (o.customer.email && ['Shipped', 'Delivered', 'Cancelled'].includes(o.status)) send(o.customer.email, statusEmail(o), 'status-customer');
}