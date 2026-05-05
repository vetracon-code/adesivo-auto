# AGENTS.md — Progetto adesivo-auto / AVVISAMI

## Regola principale
Non rompere le funzioni già funzionanti. Prima di modifiche importanti creare sempre backup del file interessato o commit/tag.

## Stack
- Node.js + Express
- PostgreSQL su Render
- Frontend statico in `public/`
- Demo principale AVVISAMI: `public/avvisami.html`
- Demo preview: `public/avvisami-preview.html`
- Demo azienda Multi-QR: `public/avvisami-azienda-demo.html`
- Owner app: `public/owner-simple.html`
- Admin: `public/admin.html`
- Kit stampa: generato da `lib/generateOwnerPrintKitHtml.js`
- Immagini AVVISAMI: `public/images/avvisami/`
- Immagini azienda demo: `public/images/avvisami/azienda/`

## Deploy
Deploy su Render tramite push GitHub:
- repo: `vetracon-code/adesivo-auto`
- branch: `main`
- URL: `https://adesivo-auto.onrender.com`

Se Render non parte:
git commit --allow-empty -m "force render redeploy ..."
git push

## Regole operative
- Lavorare velocemente in produzione se la modifica è ragionevolmente sicura.
- Verificare online e correggere subito.
- Preferire comandi Terminal raggruppati e copiabili.
- Prima di modifiche delicate creare backup:
cp file file.bak_descrizione_$(date +%Y%m%d_%H%M%S)

## Stile grafico
- Premium, realistico, pulito.
- Niente iconcine stile WhatsApp.
- Immagini realistiche/fotografiche.
- Card arrotondate, ombre morbide, stile coerente con AVVISAMI.
- Arancione/giallo AVVISAMI per CTA.
- Testi bianchi solo su sfondi scuri. Su sfondo chiaro usare testo scuro leggibile.
- Correggere sempre testi bianchi su card chiare.

## AVVISAMI demo principale
Categorie:
- Negozio
- Casa / Immobile
- Veicolo
- Barca
- Condominio
- Residence
- Quartiere
- Area pubblica
- Su misura / Multi-QR

## Immagini categorie
Casa / villa:
- avvisami-casa-bg-desktop.png
- avvisami-casa-bg-mobile.png

Condominio:
- avvisami-condominio-bg-desktop.png
- avvisami-condominio-bg-mobile.png

Residence:
- avvisami-residence-bg-desktop-day.png
- avvisami-residence-bg-mobile-day.png

Quartiere:
- avvisami-quartiere-bg-desktop.png
- avvisami-quartiere-bg-mobile.png

Area pubblica:
- avvisami-area-pubblica-bg-desktop.png
- avvisami-area-pubblica-bg-mobile.png

## Demo azienda Multi-QR
File:
- public/avvisami-azienda-demo.html

Punti:
1. Ingresso principale
2. Parcheggio
3. Magazzino
4. Area carico / scarico
5. Locale tecnico
6. Uffici
7. Servizi igienici
8. Attrezzatura / Muletto

Immagini:
- public/images/avvisami/azienda/avvisami-azienda-ingresso-principale.png
- public/images/avvisami/azienda/avvisami-azienda-parcheggio.png
- public/images/avvisami/azienda/avvisami-azienda-magazzino.png
- public/images/avvisami/azienda/avvisami-azienda-carico-scarico.png
- public/images/avvisami/azienda/avvisami-azienda-locale-tecnico.png
- public/images/avvisami/azienda/avvisami-azienda-uffici.png
- public/images/avvisami/azienda/avvisami-azienda-servizi-igienici.png
- public/images/avvisami/azienda/avvisami-azienda-attrezzatura-muletto.png

## UX demo azienda mobile/tablet
Flusso guidato:
1. Pulsante SIMULA SEGNALAZIONE nel riquadro hero.
2. Scroll automatico alla mappa.
3. Testo SELEZIONA UN PUNTO nel riquadro mappa.
4. Marker lampeggianti.
5. Tap su punto.
6. Scroll alla pagina di segnalazione.
7. Motivi lampeggianti.
8. Invia segnalazione.
9. Responsabile assegnazioni.
10. Nominativo scelto sopra Prendi in carico.
11. Prendi in carico.
12. Scelta tempo intervento.
13. Ritorno alla mappa.
14. Lampeggio punto segnalato.
15. Apertura mini-card con foto, stato e intervento previsto.

## Stati segnalazione
- Nessuna segnalazione
- Già segnalato
- Preso in carico
- In lavorazione
- Completato

Overlay foto:
- verde = nessuna segnalazione/completato
- giallo = già segnalato/in attesa
- azzurro = preso in carico
- viola = in lavorazione

## Responsabile assegnazioni
La demo deve mostrare pallino:
- verde = in azienda/disponibile
- rosso = assente/non disponibile

## Foto segnalatori
Funzione futura Premium:
- abilitabile tramite flag progetto;
- upload foto opzionale;
- validazione Super Admin obbligatoria;
- inoltro ai responsabili solo dopo approvazione;
- possibilità di scartare foto o bloccare segnalatore.

## Kit stampa owner-print-kit
Route:
- /owner-print-kit.html

Generatore:
- lib/generateOwnerPrintKitHtml.js

Logica scelta mezzo:
- Auto → visor / aletta parasole
- Furgone/Camion/Camper → xl A4 grande vetri/lunotto
- Moto/Scooter/Bici → moto / supporto due ruote
