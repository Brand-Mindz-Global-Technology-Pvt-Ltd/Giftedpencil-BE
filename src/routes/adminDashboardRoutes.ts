import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';

const router = Router();

// Protect all Dashboard endpoints with Admin authentication
router.use(adminAuthMiddleware);

// Unified Dashboard Overview & Summary APIs (Required: total products, orders, customers, sales, recent orders, status summary)
router.get('/', DashboardController.getDashboardOverview);
router.get('/summary', DashboardController.getDashboardOverview);
router.get('/recent-orders', DashboardController.getRecentOrders);
router.get('/order-status-summary', DashboardController.getOrderStatusSummary);

// Component-specific APIs for existing Admin Dashboard frontend
router.get('/sales-summary', DashboardController.getSalesSummary);
router.get('/customer-satisfaction', DashboardController.getCustomerSatisfaction);
router.get('/volume-service', DashboardController.getVolumeService);
router.get('/revenue', DashboardController.getRevenue);
router.get('/top-products', DashboardController.getTopProducts);

export default router;
