async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

function qs(selector) {
  return document.querySelector(selector);
}

function setBox(el, type, html) {
  if (!el) return;
  el.className = `${type}-box`;
  el.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}










function initOwnerLoginPage() {
  const btn = document.getElementById('ownerLoginBtn');
  const resultBox = document.getElementById('ownerLoginResult');
  const codeInput = document.getElementById('ownerCode');
  const plateInput = document.getElementById('ownerPlate');

  if (!btn || !resultBox || !codeInput || !plateInput) return;

  btn.addEventListener('click', async () => {
    const code = (codeInput.value || '').trim().toUpperCase();
    const plate = (plateInput.value || '').trim().toUpperCase().replace(/\s+/g, '');

    if (!code || !plate) {
      resultBox.innerHTML = '<div class="owner-result error">Inserisci codice adesivo e targa veicolo.</div>';
      return;
    }

    try {
      const response = await fetch('/api/owner-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, plate })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        resultBox.innerHTML = `<div class="owner-result error">${data.error || 'Accesso non consentito.'}</div>`;
        return;
      }

      const item = data.data || {};
      const vehicle = [item.brand, item.vehicle_model].filter(Boolean).join(' ');
      const uiStatusMap = {
        used: 'Attivo',
        disabled: 'Disattivato',
        reactivated: 'Riattivato',
        available: 'Non attivato'
      };

      resultBox.innerHTML = `
        <div class="owner-result">
          <h3>Accesso verificato</h3>
          <div class="owner-grid">
            <div class="owner-stat">
              <div class="label">Veicolo</div>
              <div class="value">${vehicle || '-'}</div>
            </div>
            <div class="owner-stat">
              <div class="label">Targa</div>
              <div class="value">${item.plate || '-'}</div>
            </div>
            <div class="owner-stat">
              <div class="label">Stato</div>
              <div class="value">${uiStatusMap[item.status] || item.status || '-'}</div>
            </div>
            <div class="owner-stat">
              <div class="label">Codice</div>
              <div class="value">${item.code || '-'}</div>
            </div>
          </div>
          <div class="owner-actions">
            <a class="owner-link primary" href="/owner-simple.html?code=${encodeURIComponent(item.code || '')}&plate=${encodeURIComponent(item.plate || '')}">Controllo adesivo</a>
            <a class="owner-link secondary" href="/sticker.html?code=${encodeURIComponent(item.code || '')}" target="_blank">Ristampa</a>
          </div>
        </div>
      `;
    } catch (err) {
      resultBox.innerHTML = '<div class="owner-result error">Errore di comunicazione con il server.</div>';
    }
  });
}

function initOwnerDashboardPage() {
  const vehicleEl = document.getElementById('dashVehicle');
  const plateEl = document.getElementById('dashPlate');
  const statusEl = document.getElementById('dashStatus');
  const codeEl = document.getElementById('dashCode');
  const viewsEl = document.getElementById('viewsCount');
  const messagesEl = document.getElementById('messagesCount');
  const locationsEl = document.getElementById('locationsCount');
  const lastEl = document.getElementById('lastActivity');
  const eventsEl = document.getElementById('eventList');
  const reprintBtn = document.getElementById('dashReprintBtn');
  const disableBtn = document.getElementById('dashDisableBtn');
  const disableArea = document.getElementById('dashDisableArea');
  const resultBox = document.getElementById('dashboardResult');

  if (!vehicleEl || !plateEl || !statusEl || !codeEl) return;

  const params = new URLSearchParams(window.location.search);
  const code = (params.get('code') || '').trim().toUpperCase();
  const plate = (params.get('plate') || '').trim().toUpperCase().replace(/\s+/g, '');

  if (!code || !plate) {
    resultBox.innerHTML = '<div class="result error">Codice o targa mancanti.</div>';
    return;
  }

  const uiStatusMap = {
    used: 'Attivo',
    disabled: 'Disattivato',
    reactivated: 'Riattivato',
    available: 'Non attivato'
  };

  async function loadDashboard() {
    try {
      const response = await fetch('/api/owner-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, plate })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        resultBox.innerHTML = `<div class="result error">${data.error || 'Errore caricamento dashboard.'}</div>`;
        return;
      }

      const item = data.data || {};
      vehicleEl.textContent = [item.brand, item.vehicle_model].filter(Boolean).join(' ') || '-';
      plateEl.textContent = item.plate || '-';
      statusEl.textContent = uiStatusMap[item.status] || item.status || '-';
      codeEl.textContent = item.code || '-';
      viewsEl.textContent = item.viewsCount ?? 0;
      messagesEl.textContent = item.messagesCount ?? 0;
      locationsEl.textContent = item.locationsCount ?? 0;
      lastEl.textContent = item.lastActivity ? new Date(item.lastActivity).toLocaleString('it-IT') : '-';

      reprintBtn.href = `/sticker.html?code=${encodeURIComponent(item.code || code)}`;
      document.getElementById('dashControlBtn').href = `/owner-simple.html?code=${encodeURIComponent(item.code || code)}&plate=${encodeURIComponent(item.plate || plate)}`;

      if (eventsEl) {
        const events = item.events || [];
        if (!events.length) {
          eventsEl.innerHTML = '<div class="log-item muted">Nessun evento registrato.</div>';
        } else {
          eventsEl.innerHTML = events.map(ev => {
            const area = [ev.ip_city, ev.ip_region].filter(Boolean).join(', ');
            return `
              <div class="log-item">
                <strong>${ev.type || 'Evento'}</strong><br>
                ${ev.at ? new Date(ev.at).toLocaleString('it-IT') : '-'}<br>
                <span class="muted">Area indicativa di accesso: ${area || 'Non disponibile'}</span>
                ${ev.location_shared ? '<br><span class="muted">Posizione condivisa: Sì</span>' : ''}
              </div>
            `;
          }).join('');
        }
      }

      if ((item.status || '') === 'disabled') {
        disableBtn.disabled = true;
        disableBtn.textContent = 'Adesivo disattivato';
      } else {
        disableBtn.disabled = false;
        disableBtn.textContent = 'Disattiva adesivo';
      }
    } catch (err) {
      resultBox.innerHTML = '<div class="result error">Errore di comunicazione con il server.</div>';
    }
  }

  disableBtn.addEventListener('click', () => {
    disableArea.innerHTML = `
      <div class="confirm-box">
        Confermando, l’adesivo non sarà più operativo e la pagina di contatto non sarà più raggiungibile.<br><br>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-danger" id="confirmDisableBtn" type="button">Conferma disattivazione</button>
          <button class="btn btn-secondary" id="cancelDisableBtn" type="button">Annulla</button>
        </div>
      </div>
    `;

    document.getElementById('cancelDisableBtn').addEventListener('click', () => {
      disableArea.innerHTML = '';
    });

    document.getElementById('confirmDisableBtn').addEventListener('click', async () => {
      try {
        const response = await fetch('/api/owner-disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, plate })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          resultBox.innerHTML = `<div class="result error">${data.error || 'Disattivazione non riuscita.'}</div>`;
          return;
        }

        disableArea.innerHTML = '';
        resultBox.innerHTML = `<div class="result ok">${data.message || 'Adesivo disattivato correttamente.'}</div>`;
        await loadDashboard();
      } catch (err) {
        resultBox.innerHTML = '<div class="result error">Errore di comunicazione con il server.</div>';
      }
    });
  });

  loadDashboard();
}


document.addEventListener('DOMContentLoaded', () => {
  initHomePage();
  initActivatePage();
  initAdminPage();
  initStickerPage();
  initOwnerLoginPage();
  initOwnerDashboardPage();
});

function initHomePage() {
  const btn = qs('#createCodeBtn');
  const result = qs('#createCodeResult');
  if (!btn || !result) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Generazione in corso...';

    try {
      const selectedPlan = document.getElementById('planType')?.value || 'always';
      const data = await postJSON('/api/create-code', { plan_type: selectedPlan });
      if (!data.success) {
        setBox(result, 'error', 'Errore nella generazione del codice.');
        return;
      }

      const code = data.code;
      setBox(
        result,
        'success',
        `
          <div><strong>Codice generato con successo.</strong></div>
          <div class="code-badge">${escapeHtml(code)}</div>
          ${data.public_id ? `<div class="muted" style="margin-top:8px;"><strong>ID pubblico:</strong> ${escapeHtml(data.public_id)}</div>` : ''}
          ${data.plan_type ? `<div class="muted" style="margin-top:8px;"><strong>Validità:</strong> ${escapeHtml(
            data.plan_type === 'always' ? 'Sempre valido' :
            data.plan_type === '1week' ? '1 settimana' :
            data.plan_type === '1month' ? '1 mese' : '6 mesi'
          )}</div>` : ''}
          ${data.expires_at ? `<div class="muted" style="margin-top:6px;"><strong>Scadenza:</strong> ${new Date(data.expires_at).toLocaleString('it-IT')}</div>` : ''}
          <div class="actions">
            <a class="btn btn-primary" href="/activate.html?code=${encodeURIComponent(code)}">Attiva adesso</a>
            <button class="btn btn-secondary" id="copyCodeBtn" type="button">Copia codice</button>
          </div>
        `
      );

      const copyBtn = qs('#copyCodeBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = 'Codice copiato';
        });
      }
    } catch (err) {
      setBox(result, 'error', 'Errore di comunicazione con il server.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simula acquisto e genera codice';
    }
  });
}

function initActivatePage() {
  const form = qs('#activateForm');
  const result = qs('#activateResult');
  const codeInput = qs('#code');
  const checkBtn = qs('#checkCodeBtn');
  const fillArea = qs('#vehicleFields');

  if (!form || !result || !codeInput || !checkBtn || !fillArea) return;

  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = params.get('code');
  if (codeFromUrl) codeInput.value = codeFromUrl;

  checkBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
      setBox(result, 'error', 'Inserisci prima il codice ricevuto.');
      fillArea.style.display = 'none';
      return;
    }

    try {
      const data = await postJSON('/api/check-code', { code });

      if (!data.success) {
        fillArea.style.display = 'none';

        if (data.used) {
          setBox(
            result,
            'error',
            `
              <strong>Codice già utilizzato.</strong><br>
              Se desideri attivare un nuovo adesivo, acquista un nuovo codice.
              <div class="actions">
                <a class="btn btn-primary" href="/">Acquista un nuovo codice</a>
              </div>
            `
          );
          return;
        }

        setBox(result, 'error', escapeHtml(data.message || 'Codice non valido'));
        return;
      }

      fillArea.style.display = 'block';
      setBox(result, 'success', '<strong>Codice valido.</strong> Ora completa i dati del veicolo.');
    } catch (err) {
      setBox(result, 'error', 'Errore di comunicazione con il server.');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const code = codeInput.value.trim().toUpperCase();
    const plate = qs('#plate').value.trim().toUpperCase();
    const vehicle_model = qs('#vehicle_model').value.trim();
    const phone = qs('#phone').value.trim();

    if (!code || !plate || !vehicle_model || !phone) {
      setBox(result, 'error', 'Compila tutti i campi richiesti.');
      return;
    }

    const submitBtn = qs('#activateBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Attivazione in corso...';

    try {
      const data = await postJSON('/api/activate-code', {
        code,
        plate,
        vehicle_model,
        phone
      });

      if (!data.success) {
        setBox(result, 'error', escapeHtml(data.message || 'Errore durante l’attivazione.'));
        return;
      }

      setBox(
        result,
        'success',
        `
          <strong>Adesivo attivato correttamente.</strong><br>
          Il tuo collegamento QR è pronto.
          <div class="actions">
            <a class="btn btn-primary" href="/sticker.html?code=${encodeURIComponent(code)}" target="_blank">Apri adesivo stampabile</a>
            <a class="btn btn-secondary" href="${escapeHtml(data.qr_url)}" target="_blank">Apri pagina contatto</a>
          </div>
        `
      );
    } catch (err) {
      setBox(result, 'error', 'Errore di comunicazione con il server.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Attiva adesivo';
    }
  });
}

function initAdminPage() {
  const loginBox = qs('#adminLoginBox');
  const panel = qs('#adminPanel');
  const loginBtn = qs('#adminLoginBtn');
  const loginResult = qs('#adminLoginResult');
  const findBtn = qs('#findCodeBtn');
  const findResult = qs('#findCodeResult');
  const scanStatsBox = qs('#scanStatsBox');
  const scanStatsResult = qs('#scanStatsResult');

  if (!loginBox || !panel || !loginBtn || !loginResult || !findBtn || !findResult) return;

  function getCreds() {
    return {
      email: qs('#admin_email').value.trim(),
      password: qs('#admin_password').value
    };
  }

  function renderScans(data) {
    if (!scanStatsBox || !scanStatsResult) return;

    scanStatsBox.style.display = 'block';

    const scans = data.scans || [];
    const total = data.total || 0;

    if (!scans.length) {
      scanStatsResult.innerHTML = `
        <div class="info-box">
          <strong>Scansioni totali:</strong> ${total}<br>
          Nessuna scansione registrata per questo codice.
        </div>
      `;
      return;
    }

    const items = scans.map(scan => `
      <div class="list-item">
        <strong>Data:</strong> ${escapeHtml(scan.scanned_at || '-')}<br>
        <strong>IP:</strong> ${escapeHtml(scan.ip_address || '-')}<br>
        <strong>Device:</strong> ${escapeHtml(scan.user_agent || '-')}
      </div>
    `).join('');

    scanStatsResult.innerHTML = `
      <div class="success-box">
        <strong>Scansioni totali:</strong> ${total}
      </div>
      <div class="list">
        ${items}
      </div>
    `;
  }

  loginBtn.addEventListener('click', async () => {
    const { email, password } = getCreds();

    if (!email || !password) {
      setBox(loginResult, 'error', 'Inserisci email e password amministratore.');
      return;
    }

    try {
      const data = await postJSON('/api/admin/find-code', {
        email,
        password,
        code: 'TEST-CODE'
      });

      if (data.success || (data.success === false && data.message === 'Codice non trovato')) {
        setBox(loginResult, 'success', 'Accesso autorizzato.');
        loginBox.style.display = 'none';
        panel.style.display = 'block';
        return;
      }

      setBox(loginResult, 'error', escapeHtml(data.message || 'Credenziali non valide.'));
    } catch (err) {
      setBox(loginResult, 'error', 'Errore di comunicazione con il server.');
    }
  });

  findBtn.addEventListener('click', async () => {
    const { email, password } = getCreds();
    const code = qs('#search_code').value.trim().toUpperCase();

    if (!email || !password || !code) {
      setBox(findResult, 'error', 'Inserisci email, password e codice.');
      return;
    }

    if (scanStatsBox) scanStatsBox.style.display = 'none';
    if (scanStatsResult) scanStatsResult.innerHTML = '';

    try {
      const data = await postJSON('/api/admin/find-code', { email, password, code });

      if (!data.success) {
        setBox(findResult, 'error', escapeHtml(data.message || 'Codice non trovato.'));
        return;
      }

      const item = data.data;

      setBox(
        findResult,
        'info',
        `
          <div class="list">
            <div class="list-item"><strong>Codice:</strong> ${escapeHtml(item.code)}</div>
            <div class="list-item"><strong>Stato:</strong> ${escapeHtml(item.status)}</div>
            <div class="list-item"><strong>Targa:</strong> ${escapeHtml(item.plate || '-')}</div>
            <div class="list-item"><strong>Veicolo:</strong> ${escapeHtml(item.vehicle_model || '-')}</div>
            <div class="list-item"><strong>Telefono:</strong> ${escapeHtml(item.phone || '-')}</div>
            <div class="list-item"><strong>QR URL:</strong> ${item.qr_url ? `<a href="${escapeHtml(item.qr_url)}" target="_blank">Apri pagina</a>` : '-'}</div>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" id="loadStatsBtn" type="button">Carica scansioni</button>
            <button class="btn btn-danger" id="reactivateBtn" type="button">Riattiva codice</button>
          </div>
        `
      );

      const loadStatsBtn = qs('#loadStatsBtn');
      if (loadStatsBtn) {
        loadStatsBtn.addEventListener('click', async () => {
          loadStatsBtn.disabled = true;
          loadStatsBtn.textContent = 'Caricamento...';

          try {
            const stats = await postJSON('/api/admin/scan-stats', { email, password, code });

            if (!stats.success) {
              if (scanStatsBox) scanStatsBox.style.display = 'block';
              if (scanStatsResult) {
                scanStatsResult.innerHTML = `<div class="error-box">${escapeHtml(stats.message || 'Errore nel caricamento statistiche.')}</div>`;
              }
              return;
            }

            renderScans(stats);
          } catch (err) {
            if (scanStatsBox) scanStatsBox.style.display = 'block';
            if (scanStatsResult) {
              scanStatsResult.innerHTML = `<div class="error-box">Errore di comunicazione con il server.</div>`;
            }
          } finally {
            loadStatsBtn.disabled = false;
            loadStatsBtn.textContent = 'Carica scansioni';
          }
        });
      }

      const reactivateBtn = qs('#reactivateBtn');
      if (reactivateBtn) {
        reactivateBtn.addEventListener('click', async () => {
          reactivateBtn.disabled = true;
          reactivateBtn.textContent = 'Riattivazione...';

          try {
            const resp = await postJSON('/api/admin/reactivate-code', { email, password, code });

            if (!resp.success) {
              setBox(findResult, 'error', escapeHtml(resp.message || 'Errore riattivazione.'));
              return;
            }

            setBox(
              findResult,
              'success',
              `
                <strong>Codice riattivato correttamente.</strong><br>
                I dati precedenti sono stati rimossi.
              `
            );

            if (scanStatsBox) scanStatsBox.style.display = 'none';
            if (scanStatsResult) scanStatsResult.innerHTML = '';
          } catch (err) {
            setBox(findResult, 'error', 'Errore di comunicazione con il server.');
          }
        });
      }
    } catch (err) {
      setBox(findResult, 'error', 'Errore di comunicazione con il server.');
    }
  });
}

function initStickerPage() {
  const box = qs('#stickerPage');
  if (!box) return;

  const params = new URLSearchParams(window.location.search);
  const code = (params.get('code') || '').trim().toUpperCase();
  const result = qs('#stickerResult');

  if (!code) {
    setBox(result, 'error', 'Codice mancante. Apri questa pagina passando ?code=ILTUOCODICE');
    return;
  }

  loadSticker(code, result);
}

async function loadSticker(code, result) {
  try {
    const response = await fetch(`/api/code/${encodeURIComponent(code)}`);
    const data = await response.json();

    if (!data.success || !data.data) {
      setBox(result, 'error', 'Codice non trovato.');
      return;
    }

    const item = data.data;

    if (!item.qr_url || !item.plate || !item.vehicle_model) {
      setBox(result, 'error', 'Questo codice non ha ancora dati completi per generare l’adesivo.');
      return;
    }

    const qrImageUrl = `/api/qrcode/${encodeURIComponent(code)}`;

    result.className = '';
    result.innerHTML = `
      <div class="official-master-page">
        <div class="official-master-wrap">
          <div class="official-master-badge">
            <img src="/master-badge-ufficiale.png" alt="Frame ufficiale adesivo" class="official-master-image">
            <div class="official-master-qr-slot">
              <img src="${qrImageUrl}" alt="QR Code adesivo" class="official-master-qr">
            </div>
          </div>
        </div>

        <div class="official-sticker-meta no-print">
          <div class="success-box">
            <strong>Targa:</strong> ${escapeHtml(item.plate)}<br>
            <strong>Veicolo:</strong> ${escapeHtml(item.vehicle_model)}<br>
            <strong>Codice:</strong> ${escapeHtml(item.code)}
          </div>
        </div>

        <div class="actions no-print center">
          <button class="btn btn-dark" onclick="window.print()">Stampa adesivo</button>
          <a class="btn btn-secondary" href="${escapeHtml(item.qr_url)}" target="_blank">Apri pagina contatto</a>
        </div>
      </div>
    `;
  } catch (err) {
    setBox(result, 'error', 'Errore di comunicazione con il server.');
  }
}
