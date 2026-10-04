const fs = require('node:fs/promises');
const path = require('node:path');
const { renderSettlementPdf } = require('../src/services/settlement-pdf.service');

async function main() {
  const settlement = { settlement_number: 'LIQ-2026-00000001', closure_type: 'weekly', status: 'paid', issued_at: '2026-09-07T15:00:00Z', paid_at: '2026-09-08T15:00:00Z', payout_method: 'Transferencia bancaria', payout_reference: 'TRX-DEMO-001', period_start: '2026-09-01T05:00:00Z', period_end: '2026-09-08T04:59:59Z', period_orders_count: 4, period_total_sales: 275000, period_pse_sales: 215000, period_cash_sales: 60000, period_customer_paid: 293000, period_commissions: 27500, period_topups: 100000, period_wallet_credits: 100000, period_wallet_debits: 27500, opening_wallet_balance: 40000, closing_wallet_balance: 112500, order_count: 3, gross_sales: 230000, discounts: 15000, net_product_sales: 215000, delivery_fees: 18000, customer_paid_total: 233000, platform_commission: 21500, amount_payable: 193500, document_hash: '74f69cc0da3a909ac5b7ad1602c8345a61bdf69dd238c12329e9ef013cdb6712', notes: 'Ejemplo visual sin validez contable.', company: { name: 'Comercializadora Ejemplo S.A.S.', address: 'Vereda Principal, Colombia', email: 'pagos@ejemplo.com', phone: '+57 300 000 0000' }, items: [
    { order_number: 'ORD-1001', paid_at: '2026-09-02T15:00:00Z', payment_provider: 'PSE', payment_reference: 'PSE-ABC-1001', net_product_sale: 70000, commission_amount: 7000, company_payable: 63000 },
    { order_number: 'ORD-1002', paid_at: '2026-09-04T16:30:00Z', payment_provider: 'PSE', payment_reference: 'PSE-ABC-1002', net_product_sale: 85000, commission_amount: 8500, company_payable: 76500 },
    { order_number: 'ORD-1003', paid_at: '2026-09-06T18:15:00Z', payment_provider: 'PSE', payment_reference: 'PSE-ABC-1003', net_product_sale: 60000, commission_amount: 6000, company_payable: 54000 }
  ] };
  const output = path.resolve(__dirname, '..', '..', 'output', 'pdf');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'liquidacion-ejemplo.pdf'), await renderSettlementPdf(settlement));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
