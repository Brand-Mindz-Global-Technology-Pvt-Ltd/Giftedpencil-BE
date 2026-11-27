import { Request, Response } from 'express';
import { ContactService } from '../services/contactService';
import { ContactValidator } from '../validators/contactValidator';

export class ContactController {
  /**
   * POST /api/contact
   * Submit a new contact enquiry
   */
  public static submit = async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = ContactValidator.validate(req.body);

      if (!validation.isValid || !validation.sanitized) {
        res.status(400).json({
          status: 'error',
          message: validation.errors[0]?.message || 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      const submission = await ContactService.submitContact(validation.sanitized);

      res.status(201).json({
        status: 'success',
        message: 'Thank you for reaching out! Your message has been received. Our team will get back to you within 24 hours.',
        data: {
          contact: submission
        },
        contact: submission
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Internal server error while processing contact submission'
      });
    }
  };

  /**
   * GET /api/contact
   * Retrieve all contact submissions
   */
  public static getSubmissions = async (_req: Request, res: Response): Promise<void> => {
    try {
      const submissions = await ContactService.getAllSubmissions();
      res.status(200).json({
        status: 'success',
        data: {
          submissions,
          count: submissions.length
        },
        submissions,
        count: submissions.length
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve contact submissions'
      });
    }
  };
}
