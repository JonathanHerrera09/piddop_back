const test = require('node:test');
const assert = require('node:assert/strict');
const { periodBounds, totals, salesTotals } = require('../src/services/settlement.service');
const { renderSettlementPdf } = require('../src/services/settlement-pdf.service');

test('settlement totals separate delivery and calculate company payable', () => {
  const result = totals([
    { subtotal: 100000, discount: 10000, net_product_sale: 90000, delivery_fee: 6000, customer_paid_total: 96000, commission_amount: 9000, company_payable: 81000 },
    { subtotal: 50000, discount: 0, net_product_sale: 50000, delivery_fee: 5000, customer_paid_total: 55000, commission_amount: 5000, company_payable: 45000 }
  ]);
  assert.deepEqual(result, { order_count: 2, gross_sales: 150000, discounts: 10000, net_product_sales: 140000, delivery_fees: 11000, customer_paid_total: 151000, platform_commission: 14000, amount_payable: 126000 });
});

test('settlement overview separates PSE, cash and commissions', () => {
  const result = salesTotals([
    { method: 'pse', amount: 96000, order: { subtotal: 100000, discount: 10000, commission_amount: 9000 } },
    { method: 'cash', amount: 55000, order: { subtotal: 50000, discount: 0, commission_amount: 5000 } }
  ]);
  assert.deepEqual(result, { orders: 2, total_sales: 140000, pse_sales: 90000, cash_sales: 50000, total_commissions: 14000, customer_paid: 151000 });
});

test('settlement period is inclusive in Bogota and rejects inverted ranges', () => {
  const result = periodBounds('2026-09-01', '2026-09-07');
  assert.equal(result.start.toISOString(), '2026-09-01T05:00:00.000Z');
  assert.equal(result.end.toISOString(), '2026-09-08T04:59:59.999Z');
  assert.throws(() => periodBounds('2026-09-08', '2026-09-01'));
  assert.throws(() => periodBounds('2026-02-30', '2026-03-01'));
  assert.throws(() => periodBounds('2026-01-01', '2026-13-01'));
});

test('settlement PDF is a valid non-empty PDF document', async () => {
  const pdf = await renderSettlementPdf({ settlement_number: 'LIQ-2026-00000001', closure_type: 'weekly', status: 'issued', issued_at: '2026-09-07T15:00:00Z', period_start: '2026-09-01T05:00:00Z', period_end: '2026-09-08T04:59:59Z', period_orders_count: 1, period_total_sales: 90000, period_pse_sales: 90000, period_cash_sales: 0, period_commissions: 9000, period_topups: 50000, opening_wallet_balance: 0, closing_wallet_balance: 41000, order_count: 1, gross_sales: 100000, discounts: 10000, net_product_sales: 90000, delivery_fees: 6000, customer_paid_total: 96000, platform_commission: 9000, amount_payable: 81000, document_hash: 'a'.repeat(64), company: { name: 'Empresa Demo', address: 'Bogota', email: 'demo@example.com' }, items: [{ order_number: 'ORD-001', paid_at: '2026-09-02T15:00:00Z', payment_provider: 'PSE', payment_reference: 'PSE-123', net_product_sale: 90000, commission_amount: 9000, company_payable: 81000 }] });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 1500);
});
