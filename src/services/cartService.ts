import { ProductRepository } from '../repositories/productRepository';
import { CartRepository, CartIdentity } from '../repositories/cartRepository';
import { CartItem, CartSummary } from '../types';

export class CartService {
  private static readonly FREE_SHIPPING_THRESHOLD = 499.00;
  private static readonly STANDARD_SHIPPING_FEE = 50.00;

  /**
   * Recalculate and return full cart summary from MySQL
   */
  public static async getCartSummaryAsync(identity: CartIdentity = { guestSessionId: 'guest-default' }): Promise<CartSummary> {
    const cartId = await CartRepository.findOrCreateActiveCart(identity);
    const items = await CartRepository.getCartItems(cartId);

    let subtotal = 0;
    let totalItems = 0;

    for (const item of items) {
      subtotal += item.item_total;
      totalItems += item.quantity;
    }

    subtotal = parseFloat(subtotal.toFixed(2));
    const shippingFee = subtotal === 0 || subtotal >= this.FREE_SHIPPING_THRESHOLD ? 0.00 : this.STANDARD_SHIPPING_FEE;
    const grandTotal = parseFloat((subtotal + shippingFee).toFixed(2));

    return {
      items,
      total_items: totalItems,
      subtotal,
      shipping_fee: shippingFee,
      free_shipping_threshold: this.FREE_SHIPPING_THRESHOLD,
      grand_total: grandTotal,
      currency: 'INR'
    };
  }

  /**
   * Add a product to the cart with backend price & stock validation in MySQL
   */
  public static async addToCartAsync(
    productId: number,
    quantity: number = 1,
    identity: CartIdentity = { guestSessionId: 'guest-default' }
  ): Promise<{ success: boolean; message: string; cart: CartSummary }> {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error(`Invalid product ID. Must be a positive integer.`);
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Quantity must be a positive integer.`);
    }

    // 1. Authoritative product validation from MySQL
    const product = await ProductRepository.findProductById(productId);
    if (!product) {
      throw new Error(`Product with ID ${productId} does not exist.`);
    }

    if (!product.is_active) {
      throw new Error(`Product "${product.name}" is no longer available.`);
    }

    if (product.stock <= 0) {
      throw new Error(`Product "${product.name}" is currently out of stock.`);
    }

    // 2. Find or create the active cart in MySQL
    const cartId = await CartRepository.findOrCreateActiveCart(identity);
    const existing = await CartRepository.getItem(cartId, productId);
    const currentQty = existing ? existing.quantity : 0;
    const newQty = currentQty + quantity;

    if (newQty > product.stock) {
      throw new Error(`Requested quantity (${newQty}) exceeds available inventory (${product.stock}).`);
    }

    // 3. Atomically add or increment item in MySQL
    await CartRepository.addItem(cartId, productId, quantity);

    const updatedCart = await this.getCartSummaryAsync(identity);

    return {
      success: true,
      message: `"${product.name}" added to cart.`,
      cart: updatedCart
    };
  }

  /**
   * Update item quantity in cart via MySQL
   */
  public static async updateQuantityAsync(
    productId: number,
    quantity: number,
    identity: CartIdentity = { guestSessionId: 'guest-default' }
  ): Promise<{ success: boolean; message: string; cart: CartSummary }> {
    if (quantity === 0) {
      return this.removeFromCartAsync(productId, identity);
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error(`Quantity must be a non-negative integer.`);
    }

    const product = await ProductRepository.findProductById(productId);
    if (!product) {
      throw new Error(`Product with ID ${productId} does not exist.`);
    }

    if (quantity > product.stock) {
      throw new Error(`Requested quantity (${quantity}) exceeds available stock (${product.stock}).`);
    }

    const cartId = await CartRepository.findOrCreateActiveCart(identity);
    const existing = await CartRepository.getItem(cartId, productId);
    if (!existing) {
      throw new Error(`Item is not present in the cart.`);
    }

    await CartRepository.updateItemQuantity(cartId, productId, quantity);

    const updatedCart = await this.getCartSummaryAsync(identity);

    return {
      success: true,
      message: `Cart quantity updated.`,
      cart: updatedCart
    };
  }

  /**
   * Remove product from cart via MySQL
   */
  public static async removeFromCartAsync(
    productId: number,
    identity: CartIdentity = { guestSessionId: 'guest-default' }
  ): Promise<{ success: boolean; message: string; cart: CartSummary }> {
    const cartId = await CartRepository.findOrCreateActiveCart(identity);
    const removed = await CartRepository.removeItem(cartId, productId);

    const updatedCart = await this.getCartSummaryAsync(identity);

    return {
      success: removed,
      message: removed ? 'Item removed from cart.' : 'Item was not in cart.',
      cart: updatedCart
    };
  }

  /**
   * Clear all cart items via MySQL
   */
  public static async clearCartAsync(
    identity: CartIdentity = { guestSessionId: 'guest-default' }
  ): Promise<{ success: boolean; message: string; cart: CartSummary }> {
    const cartId = await CartRepository.findOrCreateActiveCart(identity);
    await CartRepository.clearCart(cartId);

    const updatedCart = await this.getCartSummaryAsync(identity);

    return {
      success: true,
      message: 'Cart cleared successfully.',
      cart: updatedCart
    };
  }
}
