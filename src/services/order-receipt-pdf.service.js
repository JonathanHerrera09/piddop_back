const PDFDocument = require('pdfkit');

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });

function renderOrderReceiptPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [226.77, 841.89], margin: 18, info: { Title: `Comprobante ${order.order_number}`, Author: 'Piddop' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const navy = '#172033'; const orange = '#ff6711'; const muted = '#667085'; const width = 190;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text(order.company?.name || 'Piddop', { width, align: 'center' });
    doc.fillColor(orange).fontSize(9).text('COMPROBANTE DE PEDIDO', { width, align: 'center' });
    doc.moveDown(0.6).strokeColor('#d0d5dd').dash(2, { space: 2 }).moveTo(18, doc.y).lineTo(208, doc.y).stroke().undash();
    doc.moveDown(0.6).fillColor(navy).font('Helvetica-Bold').fontSize(10).text(order.order_number);
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(dateTime.format(new Date(order.created_at)));
    doc.moveDown(0.7).fillColor(navy).font('Helvetica-Bold').fontSize(8).text('CLIENTE');
    doc.font('Helvetica').text(`${order.customer?.name || ''} ${order.customer?.last_name || ''}`.trim() || 'No registrado');
    if (order.customer?.phone) doc.text(order.customer.phone);
    if (order.address) doc.text(order.address.address_line || order.address.neighborhood || '');
    doc.moveDown(0.7).font('Helvetica-Bold').text('ARTICULOS');
    (order.items || []).forEach((item) => {
      doc.font('Helvetica-Bold').fontSize(8).text(`${item.quantity} x ${item.product_name}`, { width: 130, continued: true });
      doc.text(cop.format(Number(item.line_total)), { width: 60, align: 'right' });
      doc.font('Helvetica').fillColor(muted);
      (item.variants || []).forEach((variant) => doc.text(`  + ${variant.option_name}`, { width }));
      (item.ingredientAdjustments || []).forEach((ingredient) => doc.text(`  - ${ingredient.ingredient_name}`, { width }));
      if (item.customer_notes) doc.text(`  Nota: ${item.customer_notes}`, { width });
      doc.fillColor(navy);
    });
    doc.moveDown(0.5).strokeColor('#d0d5dd').dash(2, { space: 2 }).moveTo(18, doc.y).lineTo(208, doc.y).stroke().undash();
    const totalLine = (label, value, bold = false) => { doc.moveDown(0.25).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8).fillColor(navy).text(label, { width: 100, continued: true }).text(cop.format(Number(value || 0)), { width: 90, align: 'right' }); };
    totalLine('Subtotal', order.subtotal); if (Number(order.discount)) totalLine('Descuento', -Number(order.discount)); totalLine('Domicilio', order.delivery_fee); totalLine('TOTAL', order.total, true);
    doc.moveDown(0.7).fillColor(muted).font('Helvetica').fontSize(8).text(`Pago: ${order.payment_method || 'No registrado'} - ${order.payment_status || 'pendiente'}`, { width, align: 'center' });
    doc.text(`Estado: ${order.order_status}`, { width, align: 'center' });
    doc.moveDown().fillColor(navy).font('Helvetica-Bold').fontSize(8).text('Gracias por usar Piddop.', { width, align: 'center' });
    doc.end();
  });
}

module.exports = { renderOrderReceiptPdf };
