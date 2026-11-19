import { Router } from 'express';
import { placeOrder } from '../controllers/orderController';

const router = Router();

router.post('/', placeOrder);

export default router;
