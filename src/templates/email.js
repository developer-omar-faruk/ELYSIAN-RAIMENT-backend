const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `৳${Math.round(n || 0).toLocaleString('en-US')}`;

const shell = (title, body) => `<!doctype html><html><body style="margin:0;background:#f5f0e7;font-family:Georgia,serif;color:#222">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" style="max-width:560px;background:#fffcf7;border:1px solid #e8ddca" cellpadding="0" cellspacing="0">
<tr><td style="background:#242424;color:#fff;padding:20px 24px;font-size:22px">R-Garments</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}</td></tr></table></td></tr></table></body></html>`;

const rows = (o) => o.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.name)}<br><small style="color:#777">Size ${esc(i.size)}${i.color ? ' · ' + esc(i.color) : ''} × ${i.qty}</small></td><td align="right" style="border-bottom:1px solid #eee">${money(i.price * i.qty)}</td></tr>`).join('');
const summary = (o) => `<table width="100%" style="font-size:14px;margin-top:12px">${rows(o)}</table>
<p style="font-size:14px;text-align:right;line-height:1.7">Subtotal ${money(o.subtotal)}<br>Discount -${money(o.discount)}<br>Delivery ${money(o.deliveryFee)}<br><b>Total ${money(o.total)}</b> (Cash on Delivery)</p>`;

export const customerOrderEmail = (o) => ({
  subject: `Your R-Garments order ${o.id}`,
  html: shell('Thank you for your order', `<p>Hi ${esc(o.customer.name)}, we have received your order <b>${esc(o.id)}</b> and will call to confirm it shortly.</p>${summary(o)}<p style="font-size:13px;color:#555">Delivering to: ${esc(o.address)}${o.area ? ', ' + esc(o.area) : ''} (${esc(o.zone)})</p>`),
});
export const ownerOrderEmail = (o) => ({
  subject: `New order ${o.id} · ${money(o.total)}`,
  html: shell('New order received', `<p><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}<br>${esc(o.address)}${o.area ? ', ' + esc(o.area) : ''} (${esc(o.zone)})</p>${o.note ? `<p>Note: ${esc(o.note)}</p>` : ''}${summary(o)}`),
});
export const statusEmail = (o) => ({
  subject: `Your order ${o.id} is now ${o.status}`,
  html: shell(`Order ${o.status}`, `<p>Hi ${esc(o.customer.name)}, the status of your order <b>${esc(o.id)}</b> is now <b>${esc(o.status)}</b>.</p>${o.status === 'Cancelled' ? '<p>If you did not request this, please contact us.</p>' : ''}`),
});