// src/services/pdf.service.js
// Production-grade PDF invoice generation using PDFKit.
// Designed with Sovereign Harvest aesthetic tokens and agricultural tax invoice standards.

import PDFDocument from 'pdfkit';

/**
 * Generates an invoice PDF stream for a given order object.
 * @param {Object} order - Full order record with batches, crops, farmers, and user relations
 * @param {WritableStream} outputStream - Express response or writable file stream
 */
export function generateInvoicePdf(order, outputStream) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(outputStream);

  const GOLD = '#E5A93C';
  const FOREST = '#14291F';
  const DARK_BG = '#161B22';
  const TEXT_DARK = '#222222';
  const MUTED = '#666666';
  const EMERALD = '#2EA043';
  const BORDER_COLOR = '#D0D7DE';

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 80;

  // 1. Header Banner (Forest Depth)
  doc.rect(40, 40, contentWidth, 75).fill(FOREST);

  // Platform Branding
  doc.fillColor(GOLD).fontSize(16).font('Helvetica-Bold')
    .text('SOVEREIGN HARVEST', 55, 52);
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica')
    .text('AI-Enabled Value Chain Platform for Oilseed Self-Reliance', 55, 72)
    .text('National Mission on Edible Oils (NMEO-OP) · Digital Trade Mandi', 55, 84);

  // TAX INVOICE Tag on top right
  doc.fillColor(GOLD).fontSize(14).font('Helvetica-Bold')
    .text('TAX INVOICE', pageWidth - 200, 52, { width: 145, align: 'right' });
  const isPaid = order.payment_status === 'paid';
  doc.fillColor(isPaid ? EMERALD : '#E5A93C').fontSize(9.5).font('Helvetica-Bold')
    .text(isPaid ? 'PAID & CONFIRMED' : 'PAYMENT PENDING', pageWidth - 200, 72, { width: 145, align: 'right' });

  // 2. Invoice Meta Bar
  const invoiceNum = `INV-${order.order_number ? order.order_number.replace('ORD-', '') : String(order.id).slice(0, 8).toUpperCase()}`;
  const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  }) : new Date().toLocaleDateString('en-IN');

  doc.rect(40, 125, contentWidth, 38).fillAndStroke('#F6F8FA', BORDER_COLOR);

  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
    .text('INVOICE NUMBER', 55, 132)
    .text('ORDER ID', 185, 132)
    .text('DATE OF ISSUE', 315, 132)
    .text('PAYMENT REFERENCE', 430, 132);

  doc.fillColor(TEXT_DARK).fontSize(9).font('Helvetica-Bold')
    .text(invoiceNum, 55, 144)
    .text(order.order_number || String(order.id).slice(0, 10), 185, 144)
    .text(orderDate, 315, 144)
    .text(order.payment_reference || 'DIRECT-PAYMENT', 430, 144);

  // 3. Buyer & Seller Details (Two columns)
  const colWidth = (contentWidth - 15) / 2;

  // Buyer Card
  doc.rect(40, 175, colWidth, 95).fillAndStroke('#FFFFFF', BORDER_COLOR);
  doc.fillColor(FOREST).fontSize(9).font('Helvetica-Bold').text('BILLED TO (BUYER):', 52, 185);
  doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica')
    .text(`Name: ${order.users?.full_name || 'Retail Buyer'}`, 52, 200)
    .text(`Email: ${order.users?.email || 'Registered User'}`, 52, 212)
    .text(`Delivery Address: ${order.delivery_address || 'Standard Hub Delivery'}`, 52, 224, { width: colWidth - 24 })
    .text(`Pincode: ${order.delivery_pincode || '—'}`, 52, 248);

  // Batch / Supply Origin Card
  doc.rect(40 + colWidth + 15, 175, colWidth, 95).fillAndStroke('#FFFFFF', BORDER_COLOR);
  doc.fillColor(FOREST).fontSize(9).font('Helvetica-Bold').text('PROVENANCE & ORIGIN:', 40 + colWidth + 27, 185);
  const crop = order.batches?.crops?.crop_type || order.batches?.crop_type || 'Oilseed';
  const variety = order.batches?.crops?.variety || order.batches?.variety || 'Standard';
  const batchCode = order.batches?.batch_code || 'BATCH-REG-2026';
  const origin = order.batches?.farmers?.district
    ? `${order.batches.farmers.district}, ${order.batches.farmers.state || ''}`
    : 'National Procurement Grid';

  doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica')
    .text(`Batch Code: ${batchCode}`, 40 + colWidth + 27, 200)
    .text(`Commodity: ${crop.charAt(0).toUpperCase() + crop.slice(1)} (${variety})`, 40 + colWidth + 27, 212)
    .text(`Origin: ${origin}`, 40 + colWidth + 27, 224, { width: colWidth - 24 })
    .text(`Grade: ${order.batches?.quality_grade || 'Grade A+ Certified'}`, 40 + colWidth + 27, 248);

  // 4. Line Items Table Header
  const tableTop = 285;
  doc.rect(40, tableTop, contentWidth, 24).fill(FOREST);
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
    .text('SL', 50, tableTop + 7)
    .text('COMMODITY / VARIETY', 75, tableTop + 7)
    .text('BATCH CODE', 230, tableTop + 7)
    .text('QUANTITY (KG)', 330, tableTop + 7, { width: 75, align: 'right' })
    .text('RATE (₹/KG)', 415, tableTop + 7, { width: 65, align: 'right' })
    .text('AMOUNT (₹)', 485, tableTop + 7, { width: 65, align: 'right' });

  // Table Row
  const rowTop = tableTop + 24;
  doc.rect(40, rowTop, contentWidth, 28).fillAndStroke('#FFFFFF', BORDER_COLOR);

  const qty = Number(order.quantity_kg || 0);
  const rate = Number(order.unit_price_per_kg || 0);
  const total = Number(order.total_amount || (qty * rate));

  doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica')
    .text('1', 50, rowTop + 8)
    .text(`${crop.toUpperCase()} — ${variety}`, 75, rowTop + 8)
    .text(batchCode, 230, rowTop + 8)
    .text(qty.toLocaleString('en-IN'), 330, rowTop + 8, { width: 75, align: 'right' })
    .text(`₹${rate.toFixed(2)}`, 415, rowTop + 8, { width: 65, align: 'right' })
    .font('Helvetica-Bold')
    .text(`₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 485, rowTop + 8, { width: 65, align: 'right' });

  // 5. Totals & Tax Summary
  const totalsTop = rowTop + 38;
  const totalsBoxX = pageWidth - 250;

  doc.rect(totalsBoxX, totalsTop, 210, 85).fillAndStroke('#F6F8FA', BORDER_COLOR);

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text('Subtotal:', totalsBoxX + 15, totalsTop + 12)
    .text('Mandi Tax / Cess (Exempt):', totalsBoxX + 15, totalsTop + 28)
    .text('Platform Service Fee:', totalsBoxX + 15, totalsTop + 44);

  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK)
    .text(`₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totalsBoxX + 110, totalsTop + 12, { width: 85, align: 'right' })
    .text('₹0.00', totalsBoxX + 110, totalsTop + 28, { width: 85, align: 'right' })
    .text('₹0.00 (Waived)', totalsBoxX + 110, totalsTop + 44, { width: 85, align: 'right' });

  doc.moveTo(totalsBoxX + 15, totalsTop + 58).lineTo(totalsBoxX + 195, totalsTop + 58).stroke(BORDER_COLOR);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(FOREST)
    .text('Total Amount Paid:', totalsBoxX + 15, totalsTop + 65)
    .text(`₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totalsBoxX + 110, totalsTop + 65, { width: 85, align: 'right' });

  // 6. Digital Verification & Notes Box (Left of Totals)
  const notesWidth = totalsBoxX - 55;
  doc.rect(40, totalsTop, notesWidth, 85).fillAndStroke('#FFFFFF', BORDER_COLOR);

  doc.fillColor(FOREST).fontSize(8.5).font('Helvetica-Bold')
    .text('TRANSACTION & QUALITY ASSURANCE', 52, totalsTop + 10);
  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
    .text('• Official trade transaction verified and recorded on Sovereign Harvest.', 52, totalsTop + 24)
    .text('• Payment settlement confirmed via authorized banking / gateway channel.', 52, totalsTop + 36)
    .text('• Quality grade certified in accordance with Agmarknet commodity norms.', 52, totalsTop + 48)
    .text('• Goods delivered subject to standard agricultural trade inspection terms.', 52, totalsTop + 62);

  // 7. Footer
  const footerTop = doc.page.height - 70;
  doc.moveTo(40, footerTop).lineTo(pageWidth - 40, footerTop).stroke(BORDER_COLOR);
  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
    .text('This is a computer-generated tax invoice generated under the National Mission on Edible Oils - Oilseeds (NMEO-OP).', 40, footerTop + 8, { align: 'center', width: contentWidth })
    .text('Platform Support: support@oilseed-chain.gov.in · Sovereign Harvest Agricultural Platform', 40, footerTop + 20, { align: 'center', width: contentWidth });

  doc.end();
}

/**
 * Generates an official Loan Sanction & Underwriting Assessment PDF for a loan application.
 * @param {Object} loan - Full loan record with farmer and user relations
 * @param {WritableStream} outputStream - Express response or writable file stream
 */
export function generateLoanSanctionPdf(loan, outputStream) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(outputStream);

  const GOLD = '#E5A93C';
  const FOREST = '#14291F';
  const TEXT_DARK = '#222222';
  const MUTED = '#666666';
  const EMERALD = '#2EA043';
  const BORDER_COLOR = '#D0D7DE';

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 80;

  // 1. Header Banner
  doc.rect(40, 40, contentWidth, 75).fill(FOREST);

  // Platform Branding
  doc.fillColor(GOLD).fontSize(16).font('Helvetica-Bold')
    .text('SOVEREIGN HARVEST', 55, 52);
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica')
    .text('AI-Enabled Value Chain Platform for Oilseed Self-Reliance', 55, 72)
    .text('Kisan Credit & Agri Finance Facility · NABARD / Bank Partner Network', 55, 84);

  // Status Header
  doc.fillColor(GOLD).fontSize(13).font('Helvetica-Bold')
    .text('SANCTION LETTER', pageWidth - 220, 52, { width: 165, align: 'right' });
  doc.fillColor(EMERALD).fontSize(8.5).font('Helvetica-Bold')
    .text(`STATUS: ${(loan.status || 'UNDER_REVIEW').toUpperCase()}`, pageWidth - 220, 72, { width: 165, align: 'right' });

  // 2. Metadata Bar
  doc.rect(40, 120, contentWidth, 32).fill('#F6F8FA');
  doc.rect(40, 120, contentWidth, 32).stroke(BORDER_COLOR);

  const appNum = loan.application_number || `LOAN-${loan.id?.slice(0, 8).toUpperCase()}`;
  const appDate = new Date(loan.created_at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica-Bold')
    .text(`Application No: ${appNum}`, 52, 131);
  doc.font('Helvetica').fillColor(MUTED)
    .text(`Date: ${appDate}`, 280, 131)
    .text(`Lending Entity: ${loan.institution_name || 'State Bank of India (Agri Division)'}`, 410, 131);

  // 3. Farmer & Credit Applicant Details
  const colY = 165;
  const colWidth = (contentWidth - 20) / 2;

  // Applicant Box
  doc.rect(40, colY, colWidth, 105).fillAndStroke('#FFFFFF', BORDER_COLOR);
  doc.fillColor(FOREST).fontSize(9.5).font('Helvetica-Bold').text('BORROWER / FARMER DETAILS', 52, colY + 10);
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK)
    .text(`Farmer Name: ${loan.farmers?.users?.full_name || 'Verified Oilseed Farmer'}`, 52, colY + 28)
    .text(`Farmer Account: Verified Platform Farmer`, 52, colY + 44)
    .text(`District / State: ${loan.farmers?.district || 'Purba Medinipur'}, ${loan.farmers?.state || 'West Bengal'}`, 52, colY + 60)
    .text(`Email: ${loan.farmers?.users?.email || 'farmer@sovereignharvest.org'}`, 52, colY + 76)
    .text(`Primary Crop: Certified Oilseed Cultivator`, 52, colY + 92);

  // Credit Appraisal Box
  doc.rect(50 + colWidth, colY, colWidth, 105).fillAndStroke('#FFFFFF', BORDER_COLOR);
  doc.fillColor(FOREST).fontSize(9.5).font('Helvetica-Bold').text('CREDIT FACILITY ASSESSMENT', 62 + colWidth, colY + 10);
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK)
    .text(`Appraisal Status: `, 62 + colWidth, colY + 28);
  doc.font('Helvetica-Bold').fillColor(EMERALD)
    .text(`Approved & Eligible`, 145 + colWidth, colY + 28);
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK)
    .text(`Land Verification: Verified Agricultural Land Records`, 62 + colWidth, colY + 44)
    .text(`Crop Feasibility: Recommended for Cultivation Support`, 62 + colWidth, colY + 60)
    .text(`Collateral Type: ${loan.collateral_description || 'Hypothecation of Oilseed Harvest Crops'}`, 62 + colWidth, colY + 76)
    .text(`Repayment Schedule: Post-Harvest Settlement / Quarterly EMI`, 62 + colWidth, colY + 92);

  // 4. Financial Terms Table
  const tableY = 285;
  doc.rect(40, tableY, contentWidth, 24).fill(FOREST);
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
    .text('FACILITY PARAMETER', 52, tableY + 7)
    .text('SPECIFICATION & APPLIED SUBVENTIONS', 260, tableY + 7);

  const amountReq = Number(loan.amount_requested || 0);
  const amountApp = Number(loan.approved_amount || amountReq);
  const rate = loan.interest_rate_annual || 4.0;
  const tenure = loan.tenure_months || 12;

  const rows = [
    { label: 'Credit Facility Purpose', value: (loan.purpose || 'working_capital').replace(/_/g, ' ').toUpperCase() },
    { label: 'Sanctioned / Requested Amount', value: `INR ${amountApp.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Applied: INR ${amountReq.toLocaleString('en-IN')})` },
    { label: 'Facility Tenure', value: `${tenure} Months` },
    { label: 'Subsidized Interest Rate (p.a.)', value: `${rate}% p.a. (Govt. Interest Subvention 3% Included)` },
    { label: 'Estimated Monthly Repayment', value: `INR ${(amountApp / tenure * (1 + rate/100)).toFixed(2)} / month (Approx)` },
    { label: 'Disbursement Method', value: 'Direct Benefit Transfer (DBT) to Farmer Linked Bank Account' },
  ];

  let currentY = tableY + 24;
  rows.forEach((r, idx) => {
    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F6F8FA';
    doc.rect(40, currentY, contentWidth, 24).fillAndStroke(rowBg, BORDER_COLOR);
    doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica-Bold').text(r.label, 52, currentY + 7);
    doc.font('Helvetica').fillColor(MUTED).text(r.value, 260, currentY + 7);
    currentY += 24;
  });

  // 5. Terms and Conditions Box
  const termsY = currentY + 15;
  doc.rect(40, termsY, contentWidth, 80).fillAndStroke('#FFFFFF', BORDER_COLOR);
  doc.fillColor(FOREST).fontSize(8.5).font('Helvetica-Bold').text('TERMS & REPAYMENT COVENANTS', 52, termsY + 8);
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text('1. The borrower agrees to utilize the sanctioned credit solely for oilseed crop inputs, equipment, or farm enhancement.', 52, termsY + 22)
    .text('2. Loan repayment is tied to market harvest realization via authorized bank partner repayment channels.', 52, termsY + 34)
    .text('3. Crop insurance coverage under PMFBY is linked to the sanctioned facility.', 52, termsY + 46)
    .text('4. Sanction is subject to valid bank account verification and KYC compliance.', 52, termsY + 58)
    .text('5. Sanction authorized under National Mission on Edible Oils - Oilseeds (NMEO-OP) Credit Framework.', 52, termsY + 70);

  // 6. Signatures
  const sigY = termsY + 95;
  doc.moveTo(50, sigY + 30).lineTo(200, sigY + 30).stroke(BORDER_COLOR);
  doc.moveTo(pageWidth - 200, sigY + 30).lineTo(pageWidth - 50, sigY + 30).stroke(BORDER_COLOR);

  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text('Borrower Signature / Thumb Print', 50, sigY + 35)
    .text('Authorized Bank / Nodal Officer', pageWidth - 200, sigY + 35, { width: 150, align: 'right' });

  // 7. Footer
  const footerTop = doc.page.height - 50;
  doc.moveTo(40, footerTop).lineTo(pageWidth - 40, footerTop).stroke(BORDER_COLOR);
  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
    .text('Official computer-generated credit appraisal and sanction documentation generated by Sovereign Harvest.', 40, footerTop + 8, { align: 'center', width: contentWidth });

  doc.end();
}

