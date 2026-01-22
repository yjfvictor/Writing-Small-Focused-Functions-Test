// after.js - Refactored version with small, focused functions

/**
 * Main orchestration function - coordinates the order processing workflow
 * Each step is now handled by a dedicated function with a single responsibility
 */
async function processOrder(orderData, customerInfo, paymentDetails) {
  // Validate all inputs
  validateOrderData(orderData);
  validateCustomerInfo(customerInfo);
  validatePaymentDetails(paymentDetails);
  
  // Process items and calculate subtotal
  const processedItems = await processOrderItems(orderData.items);
  const subtotal = calculateSubtotal(processedItems);
  
  // Apply discounts
  const discount = await applyDiscount(orderData.discountCode, subtotal);
  
  // Calculate shipping and tax
  const shippingCost = calculateShippingCost(subtotal);
  const tax = calculateTax(subtotal, discount.amount);
  
  // Calculate final total
  const total = calculateTotal(subtotal, discount.amount, shippingCost, tax);
  
  // Process payment
  const paymentResult = await processPayment(paymentDetails, total);
  
  // Update inventory
  await updateInventory(processedItems);
  
  // Create and save order
  const order = buildOrderRecord({
    customerInfo,
    processedItems,
    subtotal,
    discount,
    shippingCost,
    tax,
    total,
    paymentTransactionId: paymentResult.transactionId
  });
  
  const savedOrder = await saveOrder(order);
  
  // Send confirmation email
  await sendOrderConfirmationEmail(customerInfo, savedOrder, processedItems);
  
  // Return formatted response
  return formatOrderResponse(savedOrder, paymentResult.transactionId);
}

// ============================================================================
// VALIDATION FUNCTIONS - Each handles one aspect of validation
// ============================================================================

function validateOrderData(orderData) {
  if (!orderData || !orderData.items || orderData.items.length === 0) {
    throw new Error('Order must contain at least one item');
  }
}

function validateCustomerInfo(customerInfo) {
  if (!customerInfo || !customerInfo.email || !customerInfo.address) {
    throw new Error('Customer information is incomplete');
  }
  
  if (!isValidEmail(customerInfo.email)) {
    throw new Error('Invalid email address');
  }
}

function validatePaymentDetails(paymentDetails) {
  if (!paymentDetails || !paymentDetails.cardNumber || !paymentDetails.cvv) {
    throw new Error('Payment details are incomplete');
  }
  
  if (!isValidCardNumber(paymentDetails.cardNumber)) {
    throw new Error('Invalid card number');
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidCardNumber(cardNumber) {
  const cardNumberRegex = /^\d{13,19}$/;
  return cardNumberRegex.test(cardNumber.replace(/\s/g, ''));
}

// ============================================================================
// ITEM PROCESSING FUNCTIONS - Handle item validation and processing
// ============================================================================

async function processOrderItems(items) {
  const processedItems = [];
  
  for (const item of items) {
    validateItem(item);
    const product = await fetchProduct(item.productId);
    validateStockAvailability(product, item.quantity);
    
    const processedItem = buildProcessedItem(item, product);
    processedItems.push(processedItem);
  }
  
  return processedItems;
}

function validateItem(item) {
  if (!item.productId || !item.quantity || item.quantity <= 0) {
    throw new Error(`Invalid item: ${JSON.stringify(item)}`);
  }
}

async function fetchProduct(productId) {
  const product = await db.products.findById(productId);
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }
  return product;
}

function validateStockAvailability(product, requestedQuantity) {
  if (product.stock < requestedQuantity) {
    throw new Error(`Insufficient stock for product ${product.name}`);
  }
}

function buildProcessedItem(item, product) {
  return {
    productId: item.productId,
    name: product.name,
    quantity: item.quantity,
    unitPrice: product.price,
    totalPrice: product.price * item.quantity
  };
}

// ============================================================================
// CALCULATION FUNCTIONS - Each handles one calculation concern
// ============================================================================

function calculateSubtotal(processedItems) {
  return processedItems.reduce((sum, item) => sum + item.totalPrice, 0);
}

async function applyDiscount(discountCode, subtotal) {
  if (!discountCode) {
    return { amount: 0, code: null };
  }
  
  const discount = await fetchDiscount(discountCode);
  if (!discount || !discount.isActive) {
    return { amount: 0, code: null };
  }
  
  const amount = calculateDiscountAmount(discount, subtotal);
  return { amount, code: discountCode };
}

async function fetchDiscount(discountCode) {
  return await db.discounts.findByCode(discountCode);
}

function calculateDiscountAmount(discount, subtotal) {
  if (discount.type === 'percentage') {
    return subtotal * (discount.value / 100);
  } else if (discount.type === 'fixed') {
    return discount.value;
  }
  return 0;
}

function calculateShippingCost(subtotal) {
  if (subtotal >= 100) {
    return 0; // Free shipping over £100
  } else if (subtotal >= 50) {
    return 3.99;
  } else {
    return 5.99;
  }
}

function calculateTax(subtotal, discountAmount) {
  const TAX_RATE = 0.20; // 20% VAT
  return (subtotal - discountAmount) * TAX_RATE;
}

function calculateTotal(subtotal, discountAmount, shippingCost, tax) {
  return subtotal - discountAmount + shippingCost + tax;
}

// ============================================================================
// PAYMENT PROCESSING FUNCTION
// ============================================================================

async function processPayment(paymentDetails, amount) {
  const paymentResult = await paymentGateway.charge({
    amount,
    cardNumber: paymentDetails.cardNumber,
    cvv: paymentDetails.cvv,
    expiryDate: paymentDetails.expiryDate,
    cardholderName: paymentDetails.cardholderName
  });
  
  if (!paymentResult.success) {
    throw new Error(`Payment failed: ${paymentResult.error}`);
  }
  
  return paymentResult;
}

// ============================================================================
// INVENTORY MANAGEMENT FUNCTION
// ============================================================================

async function updateInventory(processedItems) {
  for (const item of processedItems) {
    await db.products.updateStock(item.productId, -item.quantity);
  }
}

// ============================================================================
// ORDER RECORD BUILDING AND PERSISTENCE
// ============================================================================

function buildOrderRecord({ customerInfo, processedItems, subtotal, discount, shippingCost, tax, total, paymentTransactionId }) {
  return {
    orderNumber: generateOrderNumber(),
    customerEmail: customerInfo.email,
    customerAddress: customerInfo.address,
    items: processedItems,
    subtotal,
    discountAmount: discount.amount,
    discountCode: discount.code,
    shippingCost,
    tax,
    total,
    paymentTransactionId,
    status: 'confirmed',
    createdAt: new Date()
  };
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function saveOrder(order) {
  return await db.orders.insert(order);
}

// ============================================================================
// EMAIL NOTIFICATION FUNCTION
// ============================================================================

async function sendOrderConfirmationEmail(customerInfo, order, processedItems) {
  const emailBody = buildOrderConfirmationEmailBody(customerInfo, order, processedItems);
  
  await emailService.send({
    to: customerInfo.email,
    subject: `Order Confirmation - ${order.orderNumber}`,
    body: emailBody
  });
}

function buildOrderConfirmationEmailBody(customerInfo, order, processedItems) {
  const itemsList = processedItems
    .map(item => `- ${item.name} x${item.quantity} - £${item.totalPrice.toFixed(2)}`)
    .join('\n');
  
  return `
    Dear ${customerInfo.name || 'Customer'},
    
    Thank you for your order!
    
    Order Number: ${order.orderNumber}
    Total: £${order.total.toFixed(2)}
    
    Items:
    ${itemsList}
    
    Your order will be shipped to:
    ${customerInfo.address}
    
    We'll send you a tracking number once your order ships.
    
    Best regards,
    The Store Team
  `;
}

// ============================================================================
// RESPONSE FORMATTING FUNCTION
// ============================================================================

function formatOrderResponse(savedOrder, transactionId) {
  return {
    orderId: savedOrder.id,
    orderNumber: savedOrder.orderNumber,
    total: savedOrder.total,
    status: 'confirmed',
    transactionId
  };
}

// ============================================================================
// Simulated dependencies (not implemented, just for context)
// ============================================================================

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
