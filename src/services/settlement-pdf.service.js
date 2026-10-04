const PDFDocument = require('pdfkit');

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });

function renderSettlementPdf(settlement) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: `Cierre financiero ${settlement.settlement_number}`, Author: 'Allora', CreationDate: new Date(settlement.issued_at) } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const orange = '#f26322'; const navy = '#172033'; const muted = '#667085';
    // Marca del emisor: Allora. Los datos de contacto se centralizarán en la
    // configuración de plataforma; nunca se toma el logo de la empresa cliente.
    doc.roundedRect(42, 38, 52, 52, 14).fill(orange);
    doc.fillColor('#ffffff').fontSize(30).font('Helvetica-Bold').text('A', 42, 48, { width: 52, align: 'center' });
    doc.fillColor(navy).fontSize(18).font('Helvetica-Bold').text('allora', 104, 51);
    doc.fillColor(muted).fontSize(7).font('Helvetica').text('PLATAFORMA ALLORA', 105, 72);
    doc.fillColor(navy).fontSize(22).font('Helvetica-Bold').text('Factura de órdenes', 130, 42, { align: 'right' });
    doc.fillColor(orange).fontSize(12).text(settlement.settlement_number, { align: 'right' });
    doc.moveDown(2.2).fillColor(navy).fontSize(8).font('Helvetica-Bold').text('CLIENTE / EMPRESA BENEFICIARIA');
    doc.fillColor(navy).fontSize(13).text(settlement.company.name);
    doc.fillColor(muted).fontSize(9).font('Helvetica').text(settlement.company.email || 'Correo no registrado');
    doc.moveDown().strokeColor('#e5e7eb').moveTo(42, doc.y).lineTo(553, doc.y).stroke(); doc.moveDown();
    const metaY = doc.y;
    const closureLabels = { weekly: 'SEMANAL', monthly: 'MENSUAL', custom: 'PERSONALIZADO' };
    doc.fillColor(muted).fontSize(8).text('PERIODO', 42, metaY).text('TIPO', 205, metaY).text('EMISION', 305, metaY).text('ESTADO', 455, metaY);
    doc.fillColor(navy).fontSize(10).font('Helvetica-Bold').text(`${date.format(new Date(settlement.period_start))} - ${date.format(new Date(settlement.period_end))}`, 42, metaY + 12)
      .text(closureLabels[settlement.closure_type] || 'PERSONALIZADO', 205, metaY + 12)
      .text(dateTime.format(new Date(settlement.issued_at)), 305, metaY + 12).text(settlement.status === 'paid' ? 'PAGADO' : 'PENDIENTE', 455, metaY + 12);
    doc.y = metaY + 42;
    doc.x = 42;
    doc.fillColor(navy).fontSize(12).font('Helvetica-Bold').text('Resumen de pago', 42, doc.y, { width: 511 });
    doc.moveDown(0.4);
    const commissionRate = Number(settlement.net_product_sales) > 0 ? (Number(settlement.platform_commission) / Number(settlement.net_product_sales)) * 100 : 0;
    const summary = [
      ['Subtotal de ventas', cop.format(Number(settlement.net_product_sales))],
      [`Deducción por uso de la app (${commissionRate.toFixed(2)}%)`, `- ${cop.format(Number(settlement.platform_commission))}`],
      ['Total a recibir', cop.format(Number(settlement.amount_payable))]
    ];
    summary.forEach(([label, value], index) => { const y = doc.y; doc.rect(42, y, 511, 24).fill(index === summary.length - 1 ? '#fff0e8' : '#f8fafc'); doc.fillColor(navy).fontSize(index === summary.length - 1 ? 11 : 9).font(index === summary.length - 1 ? 'Helvetica-Bold' : 'Helvetica').text(label, 50, y + 7).text(value, 350, y + 7, { width: 195, align: 'right' }); doc.y = y + 27; });
    doc.x = 42;
    doc.moveDown().fillColor(muted).fontSize(8).font('Helvetica').text(`Referencia de pago: ${settlement.payout_reference || 'No registrada'}. La comisión se calcula únicamente sobre el valor de venta.`, { width: 511 });
    if (doc.y > 540) doc.addPage();
    doc.x = 42;
    doc.moveDown().fillColor(navy).fontSize(12).font('Helvetica-Bold').text(`Detalle de pedidos (${settlement.order_count})`, { width: 511 }); doc.moveDown(0.4);
    const drawHeader = () => { const y = doc.y; doc.rect(42, y, 511, 22).fill(navy); doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text('FECHA', 48, y + 7).text('# ORDEN', 145, y + 7).text('VALOR DE VENTA', 285, y + 7).text('DEDUCCIÓN', 400, y + 7).text('A RECIBIR', 485, y + 7); doc.y = y + 24; };
    drawHeader();
    for (const item of settlement.items || []) {
      if (doc.y > 730) { doc.addPage(); drawHeader(); }
      const y = doc.y; doc.fillColor(muted).fontSize(7).font('Helvetica').text(date.format(new Date(item.paid_at)), 48, y + 10, { width: 86 });
      doc.fillColor(navy).fontSize(8).font('Helvetica-Bold').text(item.order_number, 145, y + 10, { width: 125 });
      doc.font('Helvetica').text(cop.format(Number(item.net_product_sale)), 285, y + 10, { width: 95, align: 'right' }).text(`- ${cop.format(Number(item.commission_amount))}`, 390, y + 10, { width: 80, align: 'right' }).font('Helvetica-Bold').text(cop.format(Number(item.company_payable)), 478, y + 10, { width: 67, align: 'right' });
      doc.strokeColor('#e5e7eb').moveTo(42, y + 28).lineTo(553, y + 28).stroke(); doc.y = y + 31;
    }
    if (doc.y > 680) doc.addPage();
    doc.x = 42;
    if (settlement.status === 'paid') { doc.moveDown().fillColor(navy).fontSize(10).font('Helvetica-Bold').text('Pago registrado', 42, doc.y, { width: 511 }); doc.fillColor(muted).fontSize(8).font('Helvetica').text(`Metodo: ${settlement.payout_method || '-'} | Referencia: ${settlement.payout_reference || '-'} | Fecha: ${dateTime.format(new Date(settlement.paid_at))}`, 42, doc.y, { width: 511 }); }
    if (settlement.notes) doc.moveDown().fillColor(muted).fontSize(8).text(`Notas: ${settlement.notes}`, 42, doc.y, { width: 511 });
    doc.moveDown().fillColor(muted).fontSize(7).text(`Huella de trazabilidad SHA-256: ${settlement.document_hash}`, 42, doc.y, { width: 511 });
    doc.moveDown(0.4).text('Documento de liquidacion y soporte operativo. No sustituye una factura electronica ni un documento tributario exigido por la DIAN.', 42, doc.y, { width: 511 });
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i += 1) { doc.switchToPage(i); doc.fillColor(muted).fontSize(7).text(`Allora | ${settlement.settlement_number} | Pagina ${i + 1} de ${pages.count}`, 42, 785, { width: 511, align: 'center', lineBreak: false }); }
    doc.end();
  });
}

module.exports = { renderSettlementPdf };
