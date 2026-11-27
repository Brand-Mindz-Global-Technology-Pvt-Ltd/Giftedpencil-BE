import { Router } from 'express';
import { AddressController } from '../controllers/addressController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// POST /api/addresses/validate - Validate address payload without persisting (utility check)
router.post('/validate', AddressController.validateAddress);

// All persistent address operations require JWT authentication
router.use(authMiddleware);

// GET /api/addresses - List all saved addresses for authenticated user
router.get('/', AddressController.getAddresses);

// POST /api/addresses - Create address with Indian mobile & PIN code validation
router.post('/', AddressController.createAddress);

// PUT /api/addresses/:id/default - Set address as default
router.put('/:id/default', AddressController.setDefaultAddress);

// GET /api/addresses/:id - Single address by ID
router.get('/:id', AddressController.getAddressById);

// PUT /api/addresses/:id - Update existing address
router.put('/:id', AddressController.updateAddress);

// DELETE /api/addresses/:id - Delete address
router.delete('/:id', AddressController.deleteAddress);

export default router;
