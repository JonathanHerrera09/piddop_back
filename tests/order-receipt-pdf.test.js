const test = require('node:test');
const assert = require('node:assert/strict');
const { renderOrderReceiptPdf } = require('../src/services/order-receipt-pdf.service');

test('order receipt PDF is a valid non-empty PDF document', async () => {
  const pdf = await renderOrderReceiptPdf({
    order_number: 'ORD-TEST-001', created_at: new Date().toISOString(), subtotal: 20000,
    discount: 0, delivery_fee: 3000, total: 23000, payment_method: 'pse', payment_status: 'paid', order_status: 'accepted',
    company: { name: 'Empresa de prueba' }, customer: { name: 'Ana', last_name: 'Prueba', phone: '3000000000' },
    address: { address_line: 'Calle de prueba 1' },
    items: [{ quantity: 1, product_name: 'Producto de prueba', line_total: 20000, variants: [], ingredientAdjustments: [] }]
  });
  assert.ok(pdf.length > 500);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
