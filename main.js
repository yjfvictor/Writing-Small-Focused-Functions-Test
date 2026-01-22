// before.js - Example of a large, complex function with multiple responsibilities

/**
 * Processes an e-commerce order - handles validation, pricing, payment, inventory, and notifications
 * This function violates the Single Responsibility Principle by doing too many things
 */
async function processOrder(orderData, customerInfo, paymentDetails) {
  // 1. Validate order data
  if (!orderData || !orderData.items || orderData.items.length === 0) {
    throw new Error('Order must contain at least one item');
  }
  
  if (!customerInfo || !customerInfo.email || !customerInfo.address) {
    throw new Error('Customer information is incomplete');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerInfo.email)) {
    throw new Error('Invalid email address');
  }
  
  // 2. Calculate item prices and totals
  let subtotal = 0;
  const processedItems = [];
  
  for (const item of orderData.items) {
    if (!item.productId || !item.quantity || item.quantity <= 0) {
      throw new Error(`Invalid item: ${JSON.stringify(item)}`);
    }
    
    // Fetch product details (simulated)
    const product = await db.products.findById(item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }
    
    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for product ${product.name}`);
    }
    
    const itemPrice = product.price * item.quantity;
    subtotal += itemPrice;
    
    processedItems.push({
      productId: item.productId,
      name: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      totalPrice: itemPrice
    });
  }
  
  // 3. Apply discounts
  let discountAmount = 0;
  let discountCode = null;
  
  if (orderData.discountCode) {
    const discount = await db.discounts.findByCode(orderData.discountCode);
    if (discount && discount.isActive) {
      if (discount.type === 'percentage') {
        discountAmount = subtotal * (discount.value / 100);
      } else if (discount.type === 'fixed') {
        discountAmount = discount.value;
      }
      discountCode = orderData.discountCode;
    }
  }
  
  // 4. Calculate shipping
  let shippingCost = 0;
  if (subtotal < 50) {
    shippingCost = 5.99;
  } else if (subtotal < 100) {
    shippingCost = 3.99;
  } else {
    shippingCost = 0; // Free shipping over £100
  }
  
  // 5. Calculate final total
  const tax = (subtotal - discountAmount) * 0.20; // 20% VAT
  const total = subtotal - discountAmount + shippingCost + tax;
  
  // 6. Process payment
  if (!paymentDetails || !paymentDetails.cardNumber || !paymentDetails.cvv) {
    throw new Error('Payment details are incomplete');
  }
  
  const cardNumberRegex = /^\d{13,19}$/;
  if (!cardNumberRegex.test(paymentDetails.cardNumber.replace(/\s/g, ''))) {
    throw new Error('Invalid card number');
  }
  
  const paymentResult = await paymentGateway.charge({
    amount: total,
    cardNumber: paymentDetails.cardNumber,
    cvv: paymentDetails.cvv,
    expiryDate: paymentDetails.expiryDate,
    cardholderName: paymentDetails.cardholderName
  });
  
  if (!paymentResult.success) {
    throw new Error(`Payment failed: ${paymentResult.error}`);
  }
  
  // 7. Update inventory
  for (const item of processedItems) {
    await db.products.updateStock(item.productId, -item.quantity);
  }
  
  // 8. Create order record
  const order = {
    orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    customerEmail: customerInfo.email,
    customerAddress: customerInfo.address,
    items: processedItems,
    subtotal: subtotal,
    discountAmount: discountAmount,
    discountCode: discountCode,
    shippingCost: shippingCost,
    tax: tax,
    total: total,
    paymentTransactionId: paymentResult.transactionId,
    status: 'confirmed',
    createdAt: new Date()
  };
  
  const savedOrder = await db.orders.insert(order);
  
  // 9. Send confirmation email
  const emailBody = `
    Dear ${customerInfo.name || 'Customer'},
    
    Thank you for your order!
    
    Order Number: ${order.orderNumber}
    Total: £${total.toFixed(2)}
    
    Items:
    ${processedItems.map(item => `- ${item.name} x${item.quantity} - £${item.totalPrice.toFixed(2)}`).join('\n')}
    
    Your order will be shipped to:
    ${customerInfo.address}
    
    We'll send you a tracking number once your order ships.
    
    Best regards,
    The Store Team
  `;
  
  await emailService.send({
    to: customerInfo.email,
    subject: `Order Confirmation - ${order.orderNumber}`,
    body: emailBody
  });
  
  // 10. Return order summary
  return {
    orderId: savedOrder.id,
    orderNumber: order.orderNumber,
    total: total,
    status: 'confirmed',
    transactionId: paymentResult.transactionId
  };
}

// Simulated dependencies (not implemented, just for context)
const db = {
  products: {
    findById: async (id) => ({ id, name: 'Product', price: 10, stock: 100 }),
    updateStock: async (id, quantity) => {}
  },
  discounts: {
    findByCode: async (code) => ({ code, type: 'percentage', value: 10, isActive: true })
  },
  orders: {
    insert: async (order) => ({ id: 1, ...order })
  }
};

const paymentGateway = {
  charge: async (details) => ({ success: true, transactionId: 'TXN-123' })
};

const emailService = {
  send: async (email) => {}
};
