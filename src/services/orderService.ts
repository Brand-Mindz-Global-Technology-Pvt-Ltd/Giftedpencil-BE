import { ProductService } from './productService';
import { CartService } from './cartService';
import { ProductRepository } from '../repositories/productRepository';
import { CartRepository, CartIdentity } from '../repositories/cartRepository';
import { AddressRepository } from '../repositories/addressRepository';
import { OrderRepository } from '../repositories/orderRepository';
import { Order, OrderItem, DeliveryAddressSnapshot } from '../types';
import { OrderValidator } from '../validators/orderValidator';

function generateOrderReference(): string {
  const timestamp = Date.now().toString().slice(-6);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `TGP-${timestamp}-${randomPart}`;
}

export class OrderService {
  /**
   * Helper to format delivery address snapshot from input payload
   */
  private static formatDeliverySnapshot(input: any): DeliveryAddressSnapshot {
    const customer_name = (input.customer_name || input.name || '').trim();
    const phone = String(input.phone || '').trim().replace(/[\s-]/g, '').slice(-10);
    const email = input.email ? String(input.email).trim().toLowerCase() : undefined;
    const house_details = (input.house_details || input.address || input.street || '').trim();
    const street_area = (input.street_area || input.colony || input.city || '').trim();
    const landmark = input.landmark ? String(input.landmark).trim() : undefined;
    const city = (input.city || 'Chennai').trim();
    const state = (input.state || 'Tamil Nadu').trim();
    const pincode = String(input.pincode || '600001').trim();

    const landmarkPart = landmark ? `, Near ${landmark}` : '';
    const addressLine = `${house_details}, ${street_area}${landmarkPart}, ${city}, ${state} – ${pincode}`;

    return {
      customer_name,
      phone,
      email,
      house_details,
      street_area,
      landmark,
      city,
      state,
      pincode,
      addressLine
    };
  }

  /**
   * Quick single-item order placement
   * Accepts: { product_id, customer_name, phone, address, quantity, ... }
   */
  public static async placeQuickOrder(
    input: any,
    userId?: string
  ): Promise<{ success: boolean; order: Order }> {
    const validation = OrderValidator.validateQuickOrder(input);
    if (!validation.isValid) {
      const err: any = new Error('Quick order validation failed');
      err.errors = validation.errors;
      throw err;
    }

    const productId = Number(input.product_id !== undefined ? input.product_id : input.productId);
    const quantity = Number(input.quantity !== undefined ? input.quantity : 1);

    // Look up product in catalog via MySQL repository
    const product = await ProductRepository.findProductByIdOrSlug(productId);

    if (!product) {
      const err: any = new Error(`Product with ID ${productId} not found`);
      err.statusCode = 404;
      throw err;
    }

    // Verify stock
    if (!product.in_stock || product.stock < quantity) {
      const err: any = new Error(`Product "${product.name}" is currently out of stock or insufficient quantity.`);
      err.statusCode = 400;
      throw err;
    }

    // Server-side price calculation
    const unitPrice = product.price;
    const totalPrice = parseFloat((unitPrice * quantity).toFixed(2));
    const shippingFee = 0.0;
    const finalAmount = totalPrice;

    const orderRef = generateOrderReference();
    const deliverySnapshot = this.formatDeliverySnapshot(input);

    const orderItem: OrderItem = {
      product_id: product.id,
      product_name: product.name,
      price: unitPrice,
      quantity,
      total_price: totalPrice,
      image: product.image
    };

    const numUserId = OrderRepository.parseNumericId(userId);

    // Save order and item atomically in MySQL
    const savedOrder = await OrderRepository.createOrderWithItems(
      {
        order_reference: orderRef,
        user_id: numUserId > 0 ? numUserId : null,
        customer_name: deliverySnapshot.customer_name,
        phone: deliverySnapshot.phone,
        email: deliverySnapshot.email,
        address: input.address.trim(),
        city: deliverySnapshot.city,
        state: deliverySnapshot.state,
        pincode: deliverySnapshot.pincode,
        delivery_address_snapshot: deliverySnapshot,
        subtotal: totalPrice,
        shipping_fee: shippingFee,
        discount_amount: 0,
        total_price: finalAmount,
        order_status: 'Pending',
        payment_status: 'Pending',
        payment_method: input.payment_method || 'Online',
        product_id: product.id,
        quantity: quantity
      },
      [orderItem]
    );

    return {
      success: true,
      order: savedOrder
    };
  }

  /**
   * Create an order from Cart or explicit checkout items
   */
  public static async checkoutOrder(
    input: any,
    userId?: string,
    cartIdentity?: CartIdentity
  ): Promise<{ success: boolean; order: Order }> {
    const validation = OrderValidator.validateCheckoutOrder(input);
    if (!validation.isValid) {
      const err: any = new Error('Checkout validation failed');
      err.errors = validation.errors;
      throw err;
    }

    const numUserId = OrderRepository.parseNumericId(userId);
    const resolvedCartIdentity: CartIdentity = cartIdentity || {
      userId: numUserId > 0 ? numUserId : undefined,
      guestSessionId: 'guest-default'
    };

    // 1. Resolve checkout items: from payload items, or active cart
    let rawItems: any[] = [];
    let itemsFromCart = false;

    if (Array.isArray(input.items) && input.items.length > 0) {
      rawItems = input.items;
    } else {
      itemsFromCart = true;
      const cartSummary = await CartService.getCartSummaryAsync(resolvedCartIdentity);
      if (!cartSummary.items || cartSummary.items.length === 0) {
        const err: any = new Error('Shopping cart is empty. Please add items to your cart before checking out.');
        err.statusCode = 400;
        throw err;
      }
      rawItems = cartSummary.items;
    }

    // 2. Validate product existence, stock, and calculate server-side prices
    const verifiedItems: OrderItem[] = [];
    let subtotal = 0;
    let totalQuantity = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const pId = Number(item.product_id !== undefined ? item.product_id : item.productId);
      const qty = Number(item.quantity);

      if (!Number.isInteger(pId) || pId <= 0) {
        const err: any = new Error(`Invalid product_id at item position ${i + 1}`);
        err.statusCode = 400;
        throw err;
      }

      if (!Number.isInteger(qty) || qty <= 0) {
        const err: any = new Error(`Quantity must be at least 1 at item position ${i + 1}`);
        err.statusCode = 400;
        throw err;
      }

      const product = await ProductRepository.findProductByIdOrSlug(pId);

      if (!product) {
        const err: any = new Error(`Product with ID ${pId} not found in catalog.`);
        err.statusCode = 404;
        throw err;
      }

      if (!product.in_stock || product.stock < qty) {
        const err: any = new Error(`Product "${product.name}" has insufficient stock available.`);
        err.statusCode = 400;
        throw err;
      }

      // Catalog price guarantee
      const unitPrice = product.price;
      const lineTotal = parseFloat((unitPrice * qty).toFixed(2));
      subtotal += lineTotal;
      totalQuantity += qty;

      verifiedItems.push({
        product_id: product.id,
        product_name: product.name,
        price: unitPrice,
        quantity: qty,
        total_price: lineTotal,
        image: product.image
      });
    }

    subtotal = parseFloat(subtotal.toFixed(2));
    const shippingFee = subtotal >= 499 ? 0.0 : 50.0;
    const grandTotal = parseFloat((subtotal + shippingFee).toFixed(2));

    // 3. Resolve address snapshot asynchronously from MySQL AddressRepository
    let deliverySnapshot: DeliveryAddressSnapshot;
    if (input.address_id) {
      if (!userId) {
        const err: any = new Error('Authentication required to use saved address_id');
        err.statusCode = 401;
        throw err;
      }
      const userAddr = await AddressRepository.findByIdAndUserId(input.address_id, userId);
      if (!userAddr) {
        const err: any = new Error(`Address with ID "${input.address_id}" not found or does not belong to your account.`);
        err.statusCode = 404;
        throw err;
      }
      deliverySnapshot = {
        customer_name: userAddr.customer_name,
        phone: userAddr.phone,
        email: userAddr.email,
        house_details: userAddr.house_details,
        street_area: userAddr.street_area,
        landmark: userAddr.landmark,
        city: userAddr.city,
        state: userAddr.state,
        pincode: userAddr.pincode,
        addressLine: userAddr.addressLine
      };
    } else {
      deliverySnapshot = this.formatDeliverySnapshot(input);
    }

    const orderRef = generateOrderReference();

    // 4. Resolve cart to clear atomically if items came from active cart
    let cartIdToClear: number | undefined = undefined;
    if (itemsFromCart) {
      cartIdToClear = await CartRepository.findOrCreateActiveCart(resolvedCartIdentity);
    }

    // 5. Create order and order items in MySQL inside a single transaction
    const savedOrder = await OrderRepository.createOrderWithItems(
      {
        order_reference: orderRef,
        user_id: numUserId > 0 ? numUserId : null,
        customer_name: deliverySnapshot.customer_name,
        phone: deliverySnapshot.phone,
        email: deliverySnapshot.email,
        address: `${deliverySnapshot.house_details}, ${deliverySnapshot.street_area}`,
        city: deliverySnapshot.city,
        state: deliverySnapshot.state,
        pincode: deliverySnapshot.pincode,
        delivery_address_snapshot: deliverySnapshot,
        subtotal,
        shipping_fee: shippingFee,
        discount_amount: 0,
        total_price: grandTotal,
        order_status: 'Pending',
        payment_status: 'Pending',
        payment_method: input.payment_method || 'Online'
      },
      verifiedItems,
      cartIdToClear
    );

    return {
      success: true,
      order: savedOrder
    };
  }

  /**
   * Retrieve all orders for authenticated user
   */
  public static async getUserOrders(userId: string): Promise<Order[]> {
    return OrderRepository.findByUserId(userId);
  }

  /**
   * Retrieve single order details with ownership verification
   */
  public static async getOrderDetails(refOrId: string, userId?: string): Promise<Order> {
    const order = await OrderRepository.findByIdOrReference(refOrId);

    if (!order) {
      const err: any = new Error(`Order with reference or ID "${refOrId}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    // Ownership check: If order has an owner and user ID is provided, enforce match
    if (order.user_id && userId) {
      const cleanOrderUserId = String(order.user_id).replace(/\D/g, '');
      const cleanReqUserId = String(userId).replace(/\D/g, '');
      if (cleanOrderUserId && cleanReqUserId && cleanOrderUserId !== cleanReqUserId) {
        const err: any = new Error('Access denied. You do not have permission to view this order.');
        err.statusCode = 404; // 404 to avoid leaking existence
        throw err;
      }
    }

    return order;
  }

  /**
   * Track order by reference and mandatory phone verification
   */
  public static async trackOrder(orderRef: string, phone: string): Promise<Order> {
    if (!phone || !phone.trim()) {
      const err: any = new Error('Phone number is required for order tracking verification.');
      err.statusCode = 400;
      throw err;
    }

    const order = await OrderRepository.findByReference(orderRef);

    if (!order) {
      const err: any = new Error('Order not found.');
      err.statusCode = 404;
      throw err;
    }

    const inputClean = phone.replace(/[\s-]/g, '').slice(-10);
    const orderClean = order.phone.replace(/[\s-]/g, '').slice(-10);

    if (inputClean.length < 10 || inputClean !== orderClean) {
      const err: any = new Error('Verification failed. The provided mobile number does not match the order reference.');
      err.statusCode = 403;
      throw err;
    }

    return order;
  }

  /**
   * Update order status on payment verification
   */
  public static async updateOrderPayment(
    orderRefOrId: string,
    paymentStatus: string,
    paymentId?: string
  ): Promise<Order | null> {
    return OrderRepository.updatePaymentStatus(orderRefOrId, paymentStatus, paymentId);
  }

  /**
   * Update order fulfillment status
   */
  public static async updateOrderStatus(
    orderRefOrId: string,
    orderStatus: string
  ): Promise<Order | null> {
    return OrderRepository.updateOrderStatus(orderRefOrId, orderStatus);
  }
}
