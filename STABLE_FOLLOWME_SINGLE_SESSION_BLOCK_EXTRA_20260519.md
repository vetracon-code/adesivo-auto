# Punto stabile FollowMe Chat — 19/05/2026

## Stato approvato

Questo punto è da considerare stabile e funzionante.

Funzioni verificate:

- Una sola sessione open per QR/progetto FollowMe.
- Le sessioni duplicate vengono chiuse automaticamente, mantenendo attiva la più recente.
- Admin e utente lavorano sulla stessa sessione reale.
- Blocco utente funzionante.
- Sblocco utente funzionante.
- Attivazione Extra contenuti funzionante.
- Disattivazione Extra contenuti funzionante.
- La funzione Extra contenuti appare/scompare lato utente in modo coerente.
- La causa principale del malfunzionamento precedente era la presenza di più sessioni open contemporanee per lo stesso QR.

## Regola tecnica da preservare

Per ogni FollowMe QR deve esistere una sola sessione chat `open` alla volta.

Quando l’utente reinquadra il QR:
1. il server deve riusare la sessione open esistente;
2. se esistono più sessioni open, deve mantenerne una sola e chiudere le altre;
3. i controlli admin devono agire sempre sulla sessione open reale.

## Non modificare senza backup

Prima di modificare:
- creazione sessione chat pubblica;
- gestione sessioni open;
- pulsanti Blocca/Sblocca;
- pulsanti Extra ON/OFF;
- script pubblici della chat utente;

creare sempre commit e tag di ripristino.
