import { Router } from 'express';
import { body, query } from '../middleware/validate.js';
import { couponLimiter, orderLimiter, trackLimiter } from '../middleware/security.js';
import { couponValidateInput, orderInput, trackQuery } from '../validators/schemas.js';
import { bootstrap, health, placeOrder, trackOrders, validateCoupon } from '../controllers/public.controller.js';

const r = Router();
r.get('/health', health);
r.get('/public/bootstrap', bootstrap);
r.post('/orders', orderLimiter, body(orderInput), placeOrder);
r.get('/orders/track', trackLimiter, query(trackQuery), trackOrders);
r.post('/coupons/validate', couponLimiter, body(couponValidateInput), validateCoupon);
export default r;