# Punto stabile provvisorio FollowMe Chat Extra / Allegati — 19/05/2026

## Stato raggiunto

Questo punto è da considerare stabile provvisorio e da proteggere.

Funzioni ora funzionanti o quasi completamente funzionanti:

- Chat FollowMe stabilizzata con una sola sessione open per QR/progetto.
- Blocco utente funzionante.
- Sblocco utente funzionante.
- Extra ON funzionante.
- Extra OFF funzionante.
- Admin e utente risultano agganciati alla stessa sessione reale.
- Lato admin: invio immagini funzionante.
- Lato admin: visualizzazione immagini/allegati in chat funzionante.
- Lato utente: invio immagini funzionante.
- Lato utente: visualizzazione allegati quasi stabilizzata con rendering immediato locale.
- Composer utente impostato verso logica corretta:
  [ + ] [ campo testo ] [ invio verde ]
- Il pulsante + lato utente deve comparire solo quando Extra è attivo.
- Il metodo desiderato deve restare uguale a quello admin: + accanto al campo testo, menu allegati, invio verde.

## Punto aperto da riprendere

Ripartire dalla registrazione audio lato utente.

Probabile tema tecnico:
- Su iPhone/Safari potrebbe essere necessario gestire esplicitamente la richiesta di autorizzazione al microfono.
- Verificare supporto `navigator.mediaDevices.getUserMedia`.
- Verificare supporto `MediaRecorder`, che può cambiare tra iPhone, Safari, Android e desktop.
- Se MediaRecorder non è supportato, predisporre fallback o messaggio guidato.
- L’audio deve essere inviato come allegato reale e visibile sia lato utente sia lato admin.

## Regola da non rompere

Non modificare senza backup:
- sessione unica open FollowMe;
- blocco/sblocco utente;
- Extra ON/OFF;
- composer admin;
- composer utente con + inline;
- rendering allegati lato admin e lato utente.

Prima di ogni nuova modifica creare sempre backup, commit e tag.
