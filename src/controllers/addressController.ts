import { Request, Response } from 'express';
import { AddressService } from '../services/addressService';
import { AddressValidator } from '../validators/addressValidator';

export class AddressController {
  /**
   * GET /api/addresses
   * List all saved addresses for authenticated user
   */
  public static getAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const addresses = await AddressService.getUserAddresses(userId);
      res.status(200).json({
        status: 'success',
        count: addresses.length,
        data: {
          addresses
        },
        addresses
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve addresses'
      });
    }
  };

  /**
   * GET /api/addresses/:id
   * Get single address by ID for authenticated user
   */
  public static getAddressById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const addressId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const address = await AddressService.getUserAddressById(addressId, userId);
      if (!address) {
        res.status(404).json({
          status: 'error',
          message: `Address with ID "${addressId}" not found.`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        data: {
          address
        },
        address
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch address'
      });
    }
  };

  /**
   * POST /api/addresses
   * Save a new address for authenticated user
   */
  public static createAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const result = await AddressService.createAddress(userId, req.body);
      res.status(201).json({
        status: 'success',
        message: 'Address saved successfully.',
        data: {
          address: result.address
        },
        address: result.address
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          status: 'error',
          message: 'Address validation failed.',
          errors: error.errors
        });
        return;
      }
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to create address'
      });
    }
  };

  /**
   * PUT /api/addresses/:id
   * Update existing address for authenticated user
   */
  public static updateAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const addressId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const result = await AddressService.updateAddress(addressId, userId, req.body);
      res.status(200).json({
        status: 'success',
        message: 'Address updated successfully.',
        data: {
          address: result.address
        },
        address: result.address
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          status: 'error',
          message: 'Address update validation failed.',
          errors: error.errors
        });
        return;
      }
      const statusCode = error.statusCode || (error.message?.includes('not found') ? 404 : 400);
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to update address'
      });
    }
  };

  /**
   * PUT /api/addresses/:id/default
   * Set address as default for authenticated user
   */
  public static setDefaultAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const addressId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const result = await AddressService.setDefaultAddress(addressId, userId);
      res.status(200).json({
        status: 'success',
        message: 'Address set as default successfully.',
        data: {
          address: result.address
        },
        address: result.address
      });
    } catch (error: any) {
      const statusCode = error.statusCode || (error.message?.includes('not found') ? 404 : 400);
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to set default address'
      });
    }
  };

  /**
   * DELETE /api/addresses/:id
   * Delete an address for authenticated user
   */
  public static deleteAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const addressId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const result = await AddressService.deleteAddress(addressId, userId);
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      const statusCode = error.statusCode || (error.message?.includes('not found') ? 404 : 400);
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to delete address'
      });
    }
  };

  /**
   * POST /api/addresses/validate
   * Dry-run validation check without persisting (open / utility)
   */
  public static validateAddress = (req: Request, res: Response): void => {
    const result = AddressValidator.validate(req.body);
    if (!result.isValid) {
      res.status(400).json({
        status: 'error',
        message: 'Address validation failed.',
        errors: result.errors
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: 'Address is valid.',
      isValid: true
    });
  };
}
