import { ContactSubmission } from '../types';
import { ContactRepository } from '../repositories/contactRepository';

export class ContactService {
  /**
   * Submit a new contact enquiry into MySQL
   */
  public static async submitContact(data: {
    name: string;
    email: string;
    phone?: string;
    subject?: string;
    message: string;
    enquiry_type?: string;
  }): Promise<ContactSubmission> {
    return ContactRepository.createSubmission(data);
  }

  /**
   * Retrieve all contact submissions from MySQL
   */
  public static async getAllSubmissions(): Promise<ContactSubmission[]> {
    const dbSubmissions = await ContactRepository.findAll();
    return dbSubmissions || [];
  }

  /**
   * Retrieve a specific submission by ID
   */
  public static async getSubmissionById(id: string): Promise<ContactSubmission | undefined> {
    const submission = await ContactRepository.findById(id);
    return submission || undefined;
  }
}
