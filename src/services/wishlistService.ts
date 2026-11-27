import { WishlistRepository } from '../repositories/wishlistRepository';
import { ProductRepository } from '../repositories/productRepository';
import { CartService } from './cartService';
import { WishlistItem, WishlistSummary, CartSummary } from '../types';
import { CartIdentity } from '../repositories/cartRepository';

export class WishlistService {
  /**
   * Return full wishlist summary for authenticated user
   */
  public static async getWishlistSummary(userId: number): Promise<WishlistSummary> {
    return WishlistRepository.getWishlistSummary(userId);
  }

  /**
   * Add a product to the authenticated user's wishlist
   */
  public static async addToWishlist(
    userId: number,
    productId: number
  ): Promise<{
    success: boolean;
    message: string;
    item: WishlistItem;
    wishlist: WishlistSummary;
  }> {
    const { item, wishlist } = await WishlistRepository.addItem(userId, productId);
    return {
      success: true,
      message: `"${item.product_name}" added to wishlist.`,
      item,
      wishlist
    };
  }

  /**
   * Remove a product from the authenticated user's wishlist
   */
  public static async removeFromWishlist(
    userId: number,
    productId: number
  ): Promise<{
    success: boolean;
    message: string;
    wishlist: WishlistSummary;
  }> {
    const wishlist = await WishlistRepository.removeItem(userId, productId);
    return {
      success: true,
      message: 'Item removed from wishlist.',
      wishlist
    };
  }

  /**
   * Clear all items from the authenticated user's wishlist
   */
  public static async clearWishlist(userId: number): Promise<{
    success: boolean;
    message: string;
    wishlist: WishlistSummary;
  }> {
    const wishlist = await WishlistRepository.clearWishlist(userId);
    return {
      success: true,
      message: 'Wishlist cleared successfully.',
      wishlist
    };
  }

  /**
   * Move a wishlist item to the shopping cart for authenticated user
   * Verifies item is in wishlist, validates stock in ProductRepository,
   * adds to Cart via CartService.addToCartAsync({ userId }),
   * and removes from Wishlist ONLY after successful Cart addition.
   */
  public static async moveToCart(
    userId: number,
    productId: number,
    quantity: number = 1
  ): Promise<{
    success: boolean;
    message: string;
    cart: CartSummary;
    wishlist: WishlistSummary;
  }> {
    // 1. Verify item is in user's wishlist
    const has = await WishlistRepository.hasItem(userId, productId);
    if (!has) {
      const err: any = new Error(`Product with ID ${productId} is not present in the wishlist.`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Validate product existence and inventory in MySQL
    const product = await ProductRepository.findProductById(productId);
    if (!product) {
      const err: any = new Error(`Product with ID ${productId} does not exist.`);
      err.statusCode = 404;
      throw err;
    }

    if (product.stock <= 0) {
      const err: any = new Error(`Product "${product.name}" is currently out of stock.`);
      err.statusCode = 400;
      throw err;
    }

    // 3. Add to authenticated user's cart in MySQL
    // If this fails (e.g. out of stock, quantity limit), it throws here and Wishlist item is NOT removed
    const cartResult = await CartService.addToCartAsync(productId, quantity, { userId });

    // 4. Remove from wishlist only after successful cart addition
    const updatedWishlist = await WishlistRepository.removeItem(userId, productId);

    return {
      success: true,
      message: `"${product.name}" moved to cart successfully.`,
      cart: cartResult.cart,
      wishlist: updatedWishlist
    };
  }

  /**
   * Backwards-compatible alias for moveToCart
   */
  public static async moveToCartAsync(
    productId: number,
    quantity: number = 1,
    identity?: CartIdentity
  ): Promise<{
    success: boolean;
    message: string;
    cart: CartSummary;
    wishlist: WishlistSummary;
  }> {
    const userId = identity?.userId || 1001;
    return this.moveToCart(userId, productId, quantity);
  }
}
