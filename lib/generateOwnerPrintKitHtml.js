function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateOwnerPrintKitHtml({ row, qrDataUrl, qrValue, code, plate }) {
  const cleanPlate = String(plate || row?.plate || '').trim().toUpperCase().replace(/\s+/g, '');
  const vehicleLabel = [row?.brand, row?.vehicle_model].filter(Boolean).join(' ') || 'Veicolo';

  const qrImg = `<img class="qr-img" src="${qrDataUrl}" alt="QR personale Contatto Veicolo">`;

  const mirror = `
<div class="a4-page mirror-page">
  <div class="hook-container safety-yellow">
    <div class="hook-top">
      <div class="cut-line-entry"></div>
      <div class="cut-circle"></div>
    </div>

    <div class="hook-body">
      <div class="archivo-extra">
        <h1 class="headline-big">PROBLEMA</h1>
        <h2 class="headline-sub">CON QUESTO VEICOLO?</h2>
      </div>

      <div class="qr-placeholder">${qrImg}</div>

      <div class="archivo-extra">
        <p class="cta-main">SCANSIONA E AVVISA<br>IL PROPRIETARIO</p>
      </div>

      <div class="footer-claim">ANONIMO • SICURO • IMMEDIATO</div>
    </div>
  </div>
</div>`;

  const dashboard = `
<div class="a4-page dashboard-page">
  <div class="card-frame">
    <div class="side-back">
      <div class="notice-box">
        <h3 class="notice-text">ESPONI QUANDO<br>PARCHEGGI</h3>
      </div>
    </div>

    <div class="fold-divider">PIEGA QUI</div>

    <div class="side-front">
      <div class="header-group">
        <h1 class="dash-main-title">PROBLEMA</h1>
        <h2 class="dash-sub-title">CON QUESTO VEICOLO?</h2>
        <p class="notice-immediate">Avvisa subito il proprietario</p>
      </div>

      <div class="qr-wrapper">${qrImg}</div>

      <div class="cta-container">
        <p class="dash-cta-text">SCANSIONA E AVVISA<br>IL PROPRIETARIO</p>
      </div>

      <div class="black-footer">
        <p class="footer-text">ANONIMO • SICURO • IMMEDIATO</p>
      </div>
    </div>
  </div>
</div>`;

  const xl = `
<div class="a4-page xl-page">
  <div class="content-wrapper">
    <div class="header-section">
      <h1 class="xl-main-title">PROBLEMA</h1>
      <h2 class="xl-sub-title">CON QUESTO VEICOLO?</h2>
    </div>

    <div class="qr-container">${qrImg}</div>

    <div class="footer-section">
      <p class="cta-line1">SCANSIONA SUBITO</p>
      <p class="cta-line2">AVVISA IL PROPRIETARIO</p>
    </div>
  </div>

  <div class="xl-black-footer">
    <p class="claim-text">ANONIMO • SICURO • IMMEDIATO</p>
  </div>
</div>`;

  const visor = `
<div class="a4-page visor-page">
  <div class="top-flap">
    <div class="arrow-tip"></div>
  </div>

  <div class="main-body">
    <h1 class="visor-main-title">PROBLEMA</h1>
    <h2 class="visor-sub-title">CON QUESTO VEICOLO?</h2>

    <div class="qr-center">${qrImg}</div>

    <p class="visor-cta-text">SCANSIONA E AVVISA IL PROPRIETARIO</p>

    <div class="black-bar">
      <p class="claim">ANONIMO • SICURO • IMMEDIATO</p>
    </div>
  </div>

  <div class="bottom-flap">
    <div class="slot-line"></div>

    <div class="driver-reminder">
      <div class="up-arrow"></div>
      <div class="parking-box">
        <p class="parking-text">ABBASSA<br>QUANDO PARCHEGGI</p>
      </div>
    </div>
  </div>
</div>`;

  const moto = `
<div class="a4-page moto-page">
  <div style="position:relative">
    <p class="label">VARIANTE A: AGGANCIO MANUBRIO O SPECCHIETTO</p>
    <div class="moto-row">
      <div class="hook-side">
        <div class="hook-hole"></div>
      </div>

      <div class="moto-card-base">
        <div class="rotated-text-group">
          <h1 class="title-moto">PROBLEMI CON<br>QUESTO MEZZO?</h1>
          <div class="qr-moto">${qrImg}</div>
          <p class="cta-moto">AVVISA IL PROPRIETARIO</p>
          <div class="black-stripe">ANONIMO • SICURO</div>
        </div>
      </div>
    </div>
  </div>

  <div style="position:relative">
    <p class="label">VARIANTE B: INCASTRO SELLA O BAULETTO</p>
    <div class="moto-row">
      <div class="tongue-side">
        <p class="instr">LINGUETTA DA<br>INCASTRARE SOTTO<br>LA SELLA O NEL BAULETTO</p>
      </div>

      <div class="moto-card-base">
        <div class="rotated-text-group">
          <h1 class="title-moto">PROBLEMI CON<br>QUESTO MEZZO?</h1>
          <div class="qr-moto">${qrImg}</div>
          <p class="cta-moto">AVVISA IL PROPRIETARIO</p>
          <div class="black-stripe">ANONIMO • SICURO</div>
        </div>
      </div>
    </div>
  </div>
</div>`;

  const models = {
    visor,
    xl,
    dashboard,
    mirror,
    moto
  };

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contatto Veicolo - Kit Cartelli - ${escHtml(cleanPlate)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }

    :root {
      --yellow: #ffea00;
      --dark: #0f172a;
      --line: #dbe3ee;
      --muted: #64748b;
      --soft: #eef3f8;
    }

    body {
      margin: 0;
      background: var(--soft);
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
    }

    .no-print {
      width: 100%;
      padding: 14px 22px;
      background: #0f172a;
      color: white;
      position: sticky;
      top: 0;
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      box-shadow: 0 10px 28px rgba(0,0,0,.22);
    }

    .no-print-title {
      font-weight: 900;
      color: var(--yellow);
      text-transform: uppercase;
      letter-spacing: .08em;
      font-size: 15px;
    }

    .no-print-sub {
      margin-top: 3px;
      font-size: 12px;
      color: #cbd5e1;
    }

    .top-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    button, .top-link {
      border: 0;
      border-radius: 999px;
      padding: 11px 15px;
      font-weight: 900;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .btn-yellow { background: var(--yellow); color: #000; }
    .btn-dark { background: #1f2937; color: white; border: 1px solid #334155; }
    .btn-white { background: white; color: #111827; border: 1px solid var(--line); }

    .page {
      max-width: 1220px;
      margin: 0 auto;
      padding: 28px 16px 70px;
    }

    .intro {
      background: white;
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 16px 48px rgba(15,23,42,.08);
    }

    .intro h1 {
      margin: 0 0 10px 0;
      font-family: Impact, "Arial Black", Arial, sans-serif;
      font-size: clamp(32px, 5vw, 54px);
      line-height: .92;
      letter-spacing: -.04em;
      text-transform: uppercase;
    }

    .intro p {
      margin: 0;
      color: #475569;
      line-height: 1.55;
      max-width: 900px;
    }

    .selector {
      background: white;
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 18px;
      margin-bottom: 22px;
      box-shadow: 0 12px 36px rgba(15,23,42,.06);
    }

    .selector h2 {
      margin: 0 0 12px 0;
      font-size: 18px;
    }

    .vehicle-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .vehicle-btn {
      background: #f8fafc;
      color: #0f172a;
      border: 1px solid var(--line);
    }

    .vehicle-btn.active {
      background: #0f172a;
      color: var(--yellow);
      border-color: #0f172a;
    }

    .recommend {
      background: #fffbea;
      border: 1px solid #fde68a;
      border-radius: 18px;
      padding: 13px 15px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .recommend strong { display: block; font-size: 14px; }
    .recommend span { color: #6b5600; font-size: 13px; }

    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 22px;
    }

    .card {
      background: white;
      border-radius: 24px;
      border: 2px solid transparent;
      overflow: hidden;
      box-shadow: 0 16px 44px rgba(15,23,42,.08);
    }

    .card.recommended {
      border-color: #0f172a;
      box-shadow: 0 22px 62px rgba(15,23,42,.18);
    }

    .card-head {
      padding: 16px 18px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .card-head h3 {
      margin: 0 0 6px 0;
      font-size: 18px;
      font-weight: 900;
    }

    .card-head p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.42;
    }

    .badge {
      display: none;
      background: var(--yellow);
      color: #000;
      border: 2px solid #000;
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .06em;
      white-space: nowrap;
    }

    .card.recommended .badge { display: inline-block; }

    .preview-zone {
      min-height: 430px;
      background: #dbe3ee;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      overflow: hidden;
    }

    .sheet-scale {
      transform: scale(.34);
      transform-origin: center;
      flex: 0 0 auto;
      box-shadow: 0 22px 70px rgba(0,0,0,.38);
    }

    .card-actions {
      border-top: 1px solid #e2e8f0;
      padding: 14px 18px 18px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .full-width { grid-column: 1 / -1; }

    .print-only { display: none; }

    .qr-img {
      width: 88%;
      height: 88%;
      object-fit: contain;
      display: block;
    }

    .qr-placeholder,
    .qr-wrapper,
    .qr-container,
    .qr-center,
    .qr-moto {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .a4-page {
      width: 210mm;
      height: 297mm;
      background: white;
      position: relative;
      overflow: hidden;
    }

    .safety-yellow { background-color: #ffea00 !important; }

    .archivo-extra {
      font-family: Impact, "Arial Black", Arial, sans-serif;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    /* SPECCHIETTO */
    .mirror-page {
      padding: 10mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .hook-container {
      width: 175mm;
      height: 270mm;
      border: 2px dashed #cbd5e1;
      border-radius: 45mm 45mm 25mm 25mm;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow: hidden;
    }

    .hook-top {
      width: 100%;
      height: 90mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .cut-circle {
      width: 55mm;
      height: 55mm;
      border: 3px dashed black;
      border-radius: 50%;
      background: white;
      z-index: 2;
    }

    .cut-line-entry {
      position: absolute;
      top: 0;
      left: 50%;
      width: 3px;
      height: 20mm;
      background: black;
      transform: translateX(-50%);
    }

    .hook-body {
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0mm 5mm;
      box-sizing: border-box;
      text-align: center;
    }

    .headline-big {
      font-size: 58pt;
      line-height: 0.85;
      margin: 0;
      text-transform: uppercase;
    }

    .headline-sub {
      font-size: 26pt;
      line-height: 1;
      margin: 2mm 0 10mm 0;
      text-transform: uppercase;
    }

    .qr-placeholder {
      width: 75mm;
      height: 75mm;
      border: 8px solid black;
      background: #fff;
      border-radius: 20px;
      margin-bottom: 10mm;
    }

    .cta-main {
      font-size: 28pt;
      line-height: 0.95;
      margin: 0;
      text-transform: uppercase;
    }

    .footer-claim {
      width: 85%;
      border-top: 5px solid black;
      margin-top: auto;
      margin-bottom: 8mm;
      padding-top: 4mm;
      font-size: 15pt;
      font-weight: 900;
      letter-spacing: 0.15em;
    }

    /* CRUSCOTTO */
    .dashboard-page {
      font-family: Impact, "Arial Black", Arial, sans-serif;
    }

    .card-frame {
      position: absolute;
      top: 18mm;
      left: 15mm;
      width: 180mm;
      height: 260mm;
      border: 1px dashed #000;
      overflow: hidden;
    }

    .side-back {
      position: absolute;
      top: 0;
      width: 100%;
      height: 120mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transform: rotate(180deg);
    }

    .notice-box {
      border: 10px solid #ffea00;
      padding: 8mm 12mm;
      text-align: center;
    }

    .notice-text { font-size: 22pt; line-height: 1.2; }

    .fold-divider {
      position: absolute;
      top: 120mm;
      width: 100%;
      height: 20mm;
      background-color: #f8fafc;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: sans-serif;
      font-size: 10pt;
      font-weight: bold;
      color: #94a3b8;
    }

    .side-front {
      position: absolute;
      top: 140mm;
      width: 100%;
      height: 120mm;
      background-color: #ffea00;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .header-group {
      margin-top: 6mm;
      text-align: center;
    }

    .dash-main-title { font-size: 52pt; line-height: 0.8; margin: 0; }
    .dash-sub-title { font-size: 22pt; margin-top: 2mm; margin-bottom: 0; }

    .notice-immediate {
      font-size: 14pt;
      margin-top: 3mm;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .qr-wrapper {
      position: absolute;
      top: 42mm;
      width: 60mm;
      height: 60mm;
      background: white;
      border: 8px solid black;
      border-radius: 25px;
    }

    .cta-container {
      position: absolute;
      top: 105mm;
      width: 100%;
      text-align: center;
    }

    .dash-cta-text {
      font-size: 20pt;
      line-height: 1.1;
      text-transform: uppercase;
      margin: 0;
    }

    .black-footer {
      position: absolute;
      bottom: 0;
      width: 100%;
      height: 14mm;
      background-color: black;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .footer-text {
      color: white;
      font-size: 13pt;
      letter-spacing: 2px;
      margin: 0;
    }

    /* A4 GRANDE */
    .xl-page {
      background-color: #ffea00;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: Impact, "Arial Black", Arial, sans-serif;
    }

    .content-wrapper {
      width: 100%;
      height: 272mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .header-section {
      text-align: center;
      margin-bottom: 14mm;
    }

    .xl-main-title {
      font-size: 80pt;
      line-height: 0.8;
      color: #000;
      letter-spacing: -2px;
      margin: 0;
    }

    .xl-sub-title {
      font-size: 32pt;
      margin-top: 4mm;
      color: #000;
      margin-bottom: 0;
    }

    .qr-container {
      width: 105mm;
      height: 105mm;
      background-color: white;
      border: 14px solid black;
      border-radius: 40px;
      flex-shrink: 0;
    }

    .footer-section {
      text-align: center;
      margin-top: 14mm;
    }

    .cta-line1 {
      font-size: 20pt;
      text-transform: uppercase;
      color: #000;
      letter-spacing: 1px;
      margin: 0 0 2mm 0;
    }

    .cta-line2 {
      font-size: 36pt;
      text-transform: uppercase;
      color: #000;
      line-height: 1;
      margin: 0;
    }

    .xl-black-footer {
      position: absolute;
      bottom: 0;
      width: 100%;
      height: 25mm;
      background-color: black;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .claim-text {
      color: white;
      font-size: 20pt;
      letter-spacing: 4px;
      text-transform: uppercase;
      margin: 0;
    }

    /* ALETTA */
    .visor-page {
      background-color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: Impact, "Arial Black", Arial, sans-serif;
    }

    .top-flap {
      width: 130mm;
      height: 80mm;
      border: 1px dashed #000;
      border-top: none;
      background: #fafafa;
      position: relative;
    }

    .arrow-tip {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 50mm;
      height: 25mm;
      background: #f0f0f0;
      border: 1px dashed #000;
      clip-path: polygon(0% 100%, 50% 0%, 100% 100%);
    }

    .main-body {
      width: 190mm;
      height: 110mm;
      background-color: #ffea00;
      border: 3px solid #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 10;
    }

    .visor-main-title {
      font-size: 48pt;
      margin-top: 6mm;
      margin-bottom: 0;
      line-height: 0.8;
      color: #000;
    }

    .visor-sub-title {
      font-size: 22pt;
      margin-top: 2mm;
      margin-bottom: 0;
      color: #000;
    }

    .qr-center {
      width: 50mm;
      height: 50mm;
      background: white;
      border: 7px solid black;
      border-radius: 20px;
      margin: 4mm 0;
    }

    .visor-cta-text {
      font-size: 16pt;
      text-transform: uppercase;
      margin: 0 0 2mm 0;
      color: #000;
    }

    .black-bar {
      width: 100%;
      height: 14mm;
      background: black;
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .claim {
      color: white;
      font-size: 12pt;
      letter-spacing: 2px;
      margin: 0;
    }

    .bottom-flap {
      width: 150mm;
      height: 107mm;
      border: 1px dashed #000;
      border-bottom: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 10mm;
      background: #fafafa;
    }

    .slot-line {
      width: 55mm;
      height: 4px;
      background: #000;
      margin-bottom: 5mm;
    }

    .driver-reminder {
      margin-top: auto;
      margin-bottom: 10mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .up-arrow {
      width: 0;
      height: 0;
      border-left: 15mm solid transparent;
      border-right: 15mm solid transparent;
      border-bottom: 20mm solid black;
      margin-bottom: 5mm;
    }

    .parking-box {
      width: 140mm;
      height: 35mm;
      background: #000;
      color: #ffea00;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
    }

    .parking-text {
      font-size: 20pt;
      text-align: center;
      text-transform: uppercase;
      line-height: 1.1;
      margin: 0;
    }

    /* MOTO */
    .moto-page {
      background-color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10mm;
      justify-content: space-around;
      font-family: Impact, "Arial Black", Arial, sans-serif;
    }

    .moto-row {
      display: flex;
      align-items: center;
      width: 195mm;
      height: 100mm;
      border: 1px dashed #eee;
      padding: 2mm;
      position: relative;
    }

    .moto-card-base {
      width: 85mm;
      height: 85mm;
      background: #ffea00;
      border: 4px solid #000;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
    }

    .rotated-text-group {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transform: rotate(-90deg);
      position: absolute;
    }

    .qr-moto {
      width: 40mm;
      height: 40mm;
      background: white;
      border: 5px solid #000;
      margin: 3mm 0;
    }

    .title-moto {
      font-size: 13pt;
      text-align: center;
      line-height: 1.1;
      color: #000;
      text-transform: uppercase;
      margin: 0;
    }

    .cta-moto {
      font-size: 8.5pt;
      text-align: center;
      margin-top: 1mm;
      color: #000;
    }

    .black-stripe {
      background: black;
      color: white;
      font-size: 7pt;
      padding: 1.5mm 6mm;
      margin-top: 2mm;
      border-radius: 4px;
      letter-spacing: 1px;
    }

    .hook-side {
      height: 65mm;
      width: 105mm;
      border: 2px dashed #000;
      border-right: none;
      background: #fdfdfd;
      position: relative;
      border-radius: 40px 0 0 40px;
      margin-right: -4px;
    }

    .hook-hole {
      position: absolute;
      top: 50%;
      left: 20mm;
      width: 35mm;
      height: 35mm;
      border: 2px dashed #000;
      border-radius: 50%;
      transform: translateY(-50%);
    }

    .tongue-side {
      height: 65mm;
      width: 105mm;
      border: 2px dashed #000;
      border-right: none;
      background: #fdfdfd;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border-radius: 15px 0 0 15px;
      margin-right: -4px;
    }

    .label {
      font-family: sans-serif;
      font-size: 7.5pt;
      color: #999;
      position: absolute;
      top: -18px;
      left: 5px;
      text-transform: uppercase;
      font-weight: bold;
    }

    .instr {
      font-family: sans-serif;
      font-size: 8.5pt;
      color: #444;
      font-weight: bold;
      padding: 15px;
      line-height: 1.3;
    }

    @media (max-width: 980px) {
      .cards { grid-template-columns: 1fr; }
      .vehicle-grid { grid-template-columns: repeat(3, 1fr); }
      .sheet-scale { transform: scale(.29); }
      .preview-zone { min-height: 360px; }
    }

    @media (max-width: 620px) {
      .vehicle-grid { grid-template-columns: repeat(2, 1fr); }
      .sheet-scale { transform: scale(.22); }
      .preview-zone { min-height: 300px; }
    }

    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        background: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .no-print,
      .page {
        display: none !important;
      }

      .print-only {
        display: block !important;
      }

      .print-only .a4-page {
        margin: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>

  <div class="no-print">
    <div>
      <div class="no-print-title">Contatto Veicolo — Kit cartelli</div>
      <div class="no-print-sub">${escHtml(vehicleLabel)} · ${escHtml(cleanPlate)} · QR reale: ${escHtml(qrValue)}</div>
    </div>

    <div class="top-actions">
      <button class="btn-dark" onclick="chooseVehicle('auto')">Auto</button>
      <button class="btn-dark" onclick="chooseVehicle('furgone')">Furgone</button>
      <button class="btn-dark" onclick="chooseVehicle('camper')">Camper</button>
      <button class="btn-dark" onclick="chooseVehicle('camion')">Camion</button>
      <button class="btn-dark" onclick="chooseVehicle('moto')">Moto</button>
      <button class="btn-dark" onclick="chooseVehicle('scooter')">Scooter</button>
      <button class="btn-yellow" onclick="printRecommended()">Stampa consigliato</button>
      <a class="top-link btn-white" href="/owner-app/${encodeURIComponent(code || row?.code || '')}/${encodeURIComponent(cleanPlate)}">Torna all’App</a>
    </div>
  </div>

  <main class="page">
    <section class="intro">
      <h1>Scegli il cartello più adatto</h1>
      <p>Ogni modello usa lo stesso QR personale del tuo veicolo. Scegli il supporto più comodo, controlla l’anteprima e stampa solo quello che vuoi usare.</p>
    </section>

    <section class="selector">
      <h2>Che veicolo vuoi proteggere?</h2>
      <div class="vehicle-grid">
        <button class="vehicle-btn active" data-vehicle="auto" onclick="chooseVehicle('auto')">Auto</button>
        <button class="vehicle-btn" data-vehicle="furgone" onclick="chooseVehicle('furgone')">Furgone</button>
        <button class="vehicle-btn" data-vehicle="camper" onclick="chooseVehicle('camper')">Camper</button>
        <button class="vehicle-btn" data-vehicle="camion" onclick="chooseVehicle('camion')">Camion</button>
        <button class="vehicle-btn" data-vehicle="moto" onclick="chooseVehicle('moto')">Moto</button>
        <button class="vehicle-btn" data-vehicle="scooter" onclick="chooseVehicle('scooter')">Scooter</button>
        <button class="vehicle-btn" data-vehicle="bici" onclick="chooseVehicle('bici')">Bici / Mono.</button>
      </div>

      <div class="recommend">
        <div>
          <strong id="recTitle">Consigliato: Aletta parasole</strong>
          <span id="recText">Per auto private è la soluzione più ordinata e meno invasiva.</span>
        </div>
        <button class="btn-yellow" onclick="printRecommended()">Stampa modello consigliato</button>
      </div>
    </section>

    <section class="cards" id="cards">
      <article class="card recommended" data-model="visor">
        <div class="card-head">
          <div>
            <h3>1. Aletta parasole</h3>
            <p>Consigliata per auto private e furgoni leggeri. Testo: VEICOLO.</p>
          </div>
          <span class="badge">CONSIGLIATO</span>
        </div>
        <div class="preview-zone"><div class="sheet-scale">${visor}</div></div>
        <div class="card-actions"><button class="btn-white" onclick="printModel('visor')">Stampa aletta</button></div>
      </article>

      <article class="card" data-model="xl">
        <div class="card-head">
          <div>
            <h3>2. A4 grande vetri / lunotto</h3>
            <p>Consigliato per furgoni, camper, camion e mezzi professionali. Testo: VEICOLO.</p>
          </div>
          <span class="badge">CONSIGLIATO</span>
        </div>
        <div class="preview-zone"><div class="sheet-scale">${xl}</div></div>
        <div class="card-actions"><button class="btn-white" onclick="printModel('xl')">Stampa A4 grande</button></div>
      </article>

      <article class="card" data-model="dashboard">
        <div class="card-head">
          <div>
            <h3>3. Pieghevole da cruscotto</h3>
            <p>Soluzione rapida da piegare e appoggiare. Testo: VEICOLO.</p>
          </div>
          <span class="badge">CONSIGLIATO</span>
        </div>
        <div class="preview-zone"><div class="sheet-scale">${dashboard}</div></div>
        <div class="card-actions"><button class="btn-white" onclick="printModel('dashboard')">Stampa cruscotto</button></div>
      </article>

      <article class="card" data-model="mirror">
        <div class="card-head">
          <div>
            <h3>4. Specchietto interno</h3>
            <p>Soluzione removibile da appendere solo a veicolo parcheggiato. Testo: VEICOLO.</p>
          </div>
          <span class="badge">CONSIGLIATO</span>
        </div>
        <div class="preview-zone"><div class="sheet-scale">${mirror}</div></div>
        <div class="card-actions"><button class="btn-white" onclick="printModel('mirror')">Stampa specchietto</button></div>
      </article>

      <article class="card full-width" data-model="moto">
        <div class="card-head">
          <div>
            <h3>5. Moto / scooter / bici</h3>
            <p>Supporto dedicato a due ruote e mezzi leggeri. Qui resta MEZZO.</p>
          </div>
          <span class="badge">CONSIGLIATO</span>
        </div>
        <div class="preview-zone"><div class="sheet-scale">${moto}</div></div>
        <div class="card-actions"><button class="btn-white" onclick="printModel('moto')">Stampa moto / scooter / bici</button></div>
      </article>
    </section>
  </main>

  <div class="print-only" id="printOnly"></div>

  <template id="tpl-visor">${visor}</template>
  <template id="tpl-xl">${xl}</template>
  <template id="tpl-dashboard">${dashboard}</template>
  <template id="tpl-mirror">${mirror}</template>
  <template id="tpl-moto">${moto}</template>

  <script>
    var recommendedModel = 'visor';

    var recMap = {
      auto: { model: 'visor', title: 'Consigliato: Aletta parasole', text: 'Per auto private è la soluzione più ordinata e meno invasiva.' },
      furgone: { model: 'xl', title: 'Consigliato: A4 grande vetri / lunotto', text: 'Per mezzi commerciali serve massima visibilità.' },
      camper: { model: 'xl', title: 'Consigliato: A4 grande vetri / lunotto', text: 'Per camper e mezzi grandi il formato A4 intero è più leggibile.' },
      camion: { model: 'xl', title: 'Consigliato: A4 grande vetri / lunotto', text: 'Per camion e mezzi pesanti il formato più visibile è l’A4 grande.' },
      moto: { model: 'moto', title: 'Consigliato: Supporto moto / scooter / bici', text: 'Per due ruote e mezzi leggeri resta corretto usare “mezzo”.' },
      scooter: { model: 'moto', title: 'Consigliato: Supporto moto / scooter / bici', text: 'Da plastificare e fissare in modo stabile.' },
      bici: { model: 'moto', title: 'Consigliato: Supporto moto / scooter / bici', text: 'Adatto anche a bici e monopattini, con fissaggio esterno.' }
    };

    function chooseVehicle(vehicle) {
      document.querySelectorAll('.vehicle-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.vehicle === vehicle);
      });

      var rec = recMap[vehicle] || recMap.auto;
      recommendedModel = rec.model;

      document.getElementById('recTitle').textContent = rec.title;
      document.getElementById('recText').textContent = rec.text;

      document.querySelectorAll('.card').forEach(function(card) {
        card.classList.toggle('recommended', card.dataset.model === rec.model);
      });

      var cards = document.getElementById('cards');
      var selected = cards.querySelector('[data-model="' + rec.model + '"]');
      if (selected) cards.prepend(selected);

      setTimeout(function() {
        cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }

    function printRecommended() {
      printModel(recommendedModel);
    }

    function printModel(model) {
      var tpl = document.getElementById('tpl-' + model);
      if (!tpl) return;
      document.getElementById('printOnly').innerHTML = tpl.innerHTML;
      setTimeout(function() {
        window.print();
      }, 80);
    }
  </script>
</body>
</html>`;
}

module.exports = generateOwnerPrintKitHtml;
