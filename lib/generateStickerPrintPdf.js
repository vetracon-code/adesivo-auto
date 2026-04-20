const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'adesivo-template-a4.pdf');

// Posizione definitiva approvata
const QR_PLACEMENT = {
  x: 236.5808,
  yTop: 605.8491,
  yBottom: 193.3169,
  size: 121.6187
};

async function generateStickerPrintPdf({ qrValue }) {
  if (!qrValue || !String(qrValue).trim()) {
    throw new Error('qrValue mancante');
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template PDF non trovato: ${TEMPLATE_PATH}`);
  }

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];

  const qrPngBytes = await QRCode.toBuffer(String(qrValue).trim(), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 1200,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  const qrImage = await pdfDoc.embedPng(qrPngBytes);
  const { x, yTop, yBottom, size } = QR_PLACEMENT;

  page.drawImage(qrImage, {
    x,
    y: yTop,
    width: size,
    height: size
  });

  page.drawImage(qrImage, {
    x,
    y: yBottom,
    width: size,
    height: size
  });

  const out = await pdfDoc.save();
  return Buffer.from(out);
}

module.exports = {
  generateStickerPrintPdf,
  QR_PLACEMENT
};
