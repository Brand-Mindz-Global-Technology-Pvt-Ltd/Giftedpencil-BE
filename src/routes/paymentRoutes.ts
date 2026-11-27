import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';

const router = Router();

// GET /api/payment/methods - Available online payment methods (COD disabled)
router.get('/methods', PaymentController.getMethods);

// POST /api/payment/create-order - Create simulated payment order
router.post('/create-order', PaymentController.createOrder);

// POST /api/payment/verify - Verify simulated payment
router.post('/verify', PaymentController.verifyPayment);

export default router;
