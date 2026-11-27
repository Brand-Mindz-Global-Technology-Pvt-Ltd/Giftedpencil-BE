import { Router } from 'express';
import { checkPincodeServiceability } from '../controllers/shippingController';

const router = Router();

router.post('/check-pincode', checkPincodeServiceability);

export default router;
