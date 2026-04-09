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

document.addEventListener('DOMContentLoaded', () => {
  initHomePage();
  initActivatePage();
  initAdminPage();
  initStickerPage();
});

function initHomePage() {
  const btn = qs('#createCodeBtn');
  const result = qs('#createCodeResult');
  if (!btn || !result) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Generazione in corso...';

    try {
      const data = await postJSON('/api/create-code', {});
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

  if (!loginBox || !panel || !loginBtn || !loginResult || !findBtn || !findResult) return;

  function getCreds() {
    return {
      email: qs('#admin_email').value.trim(),
      password: qs('#admin_password').value
    };
  }

  loginBtn.addEventListener('click', async () => {
    const { email, password } = getCreds();

    if (!email || !password) {
      setBox(loginResult, 'error', 'Inserisci email e password admin.');
      return;
    }

    try {
      const testCode = qs('#admin_test_code').value.trim().toUpperCase() || 'TEST-CODE';
      const data = await postJSON('/api/admin/find-code', { email, password, code: testCode });

      if (data.success || (data.success === false && data.message === 'Codice non trovato')) {
        setBox(loginResult, 'success', 'Accesso admin accettato.');
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
      setBox(findResult, 'error', 'Inserisci codice, email e password.');
      return;
    }

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
            <button class="btn btn-danger" id="reactivateBtn" type="button">Riattiva codice</button>
          </div>
        `
      );

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
      <div class="sticker-sheet">
        <div class="sticker">
          <div>
            <h1>Segnalazione veicolo</h1>
            <p>Scansiona il QR per contattare rapidamente il proprietario in caso di urgenza.</p>
            <div class="plate">Targa ${escapeHtml(item.plate)}</div>
            <p>${escapeHtml(item.vehicle_model)}</p>
            <div class="footer-note">Usare solo per segnalazioni urgenti relative al veicolo.</div>
          </div>
          <div class="qr-wrap">
            <img src="${qrImageUrl}" alt="QR Code adesivo">
          </div>
        </div>
      </div>
      <div class="actions no-print center">
        <button class="btn btn-dark" onclick="window.print()">Stampa adesivo</button>
        <a class="btn btn-secondary" href="${escapeHtml(item.qr_url)}" target="_blank">Apri pagina contatto</a>
      </div>
    `;
  } catch (err) {
    setBox(result, 'error', 'Errore di comunicazione con il server.');
  }
}
