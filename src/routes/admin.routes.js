import express, { Router } from 'express';
import { body, query } from '../middleware/validate.js';
import { adminLimiter, loginLimiter, setupLimiter } from '../middleware/security.js';
import { csrfGuard, requireAdmin, requireRole } from '../middleware/auth.js';
import * as S from '../validators/schemas.js';
import * as A from '../controllers/auth.controller.js';
import * as P from '../controllers/products.controller.js';
import * as C from '../controllers/content.controller.js';
import * as O from '../controllers/orders.controller.js';
import * as M from '../controllers/admin.controller.js';

const r = Router();

// Pre-auth endpoints
r.get('/setup-status', adminLimiter, A.setupStatus);
r.post('/setup', setupLimiter, body(S.setupSchema), A.setup);
r.post('/login', loginLimiter, body(S.loginSchema), A.login);
r.post('/logout', adminLimiter, A.logout);

// Everything below requires a valid session, and state-changing calls require the CSRF token
r.use(adminLimiter, requireAdmin, csrfGuard);
r.get('/me', A.me);
r.put('/profile', body(S.profileSchema), A.updateProfile);

r.get('/analytics', query(S.analyticsQuery), M.analyticsRoute);

r.get('/products', query(S.productQuery), P.listProducts);
r.post('/products', body(S.productInput), P.createProduct);
r.put('/products/:id', body(S.productInput), P.updateProduct);
r.patch('/products/:id/flags', body(S.flagsInput), P.patchFlags);
r.delete('/products/:id', P.deleteProduct);
r.put('/homepage/flags', body(S.homepageFlags), P.setHomepageFlags);

r.get('/categories', C.listCategories);
r.post('/categories/reorder', body(S.reorderCategories), C.reorderCategories);
r.post('/categories', body(S.categoryInput), C.createCategory);
r.put('/categories/:slug', body(S.categoryInput), C.updateCategory);
r.delete('/categories/:slug', C.deleteCategory);

r.get('/banners', C.listBanners);
r.post('/banners/reorder', body(S.reorderBanners), C.reorderBanners);
r.post('/banners', body(S.bannerInput), C.createBanner);
r.put('/banners/:id', body(S.bannerInput), C.updateBanner);
r.delete('/banners/:id', C.deleteBanner);

r.get('/coupons', C.listCoupons);
r.post('/coupons', body(S.couponInput), C.createCoupon);
r.put('/coupons/:id', body(S.couponInput), C.updateCoupon);
r.delete('/coupons/:id', C.deleteCoupon);

r.get('/reviews', query(S.reviewQuery), C.listReviews);
r.patch('/reviews/:id', body(S.reviewPatch), C.patchReview);
r.delete('/reviews/:id', C.deleteReview);

r.get('/settings', C.getAdminSettings);
r.put('/settings', requireRole('owner'), body(S.settingsInput), C.putSettings);

r.get('/inventory/history', query(S.historyQuery), M.inventoryHistory);
r.get('/inventory', query(S.inventoryQuery), M.inventory);
r.post('/inventory/adjust', body(S.adjustInput), M.adjustInventory);

r.get('/orders', query(S.orderListQuery), O.listOrders);
r.post('/orders/bulk', body(S.bulkInput), O.bulkStatus);
r.get('/orders/:id', O.getOrder);
r.patch('/orders/:id', body(S.orderPatch), O.patchOrder);
r.post('/orders/:id/notes', body(S.noteInput), O.addNote);

r.get('/customers', query(S.customerQuery), M.listCustomers);
r.get('/customers/:phone', M.getCustomer);

// Authenticated and CSRF-checked BEFORE the larger body is parsed
r.post('/upload', express.json({ limit: '8mb' }), body(S.uploadInput), M.upload);

export default r;