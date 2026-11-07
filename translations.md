# Translations

Kosha's interface, emails, server messages and AI replies are translated. This file is for whoever translates Kosha, person or agent. It lists the supported languages, how the message files work, how to add a language, and the key terms with what they mean, so a translation keeps the meaning and not only the words.

## Supported languages

The language comes from the `kosha-locale` cookie, then the browser's languages, then English. Numbers and dates follow the language through `intlLocale()` in `core.ts` (English formats as British English).

| Code | Language                                 | Register                                                 | Formats €1,234.56 and 7 Nov 2026 as |
| ---- | ---------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| `en` | English (source)                         | plain, direct                                            | €1,234.56, 07/11/2026               |
| `de` | Deutsch (German)                         | informal "du"                                            | 1.234,56 €, 7.11.2026               |
| `es` | Español (Spanish, neutral international) | informal "tú"                                            | 1234,56 €, 7/11/2026                |
| `fr` | Français (French)                        | "vous"; non-breaking space before : ; ? ! and inside « » | 1 234,56 €, 07/11/2026              |
| `pt` | Português (Brazilian Portuguese)         | "você"                                                   | € 1.234,56, 07/11/2026              |
| `it` | Italiano (Italian)                       | informal "tu"                                            | 1234,56 €, 07/11/2026               |
| `nl` | Nederlands (Dutch)                       | informal "je"                                            | € 1.234,56, 7-11-2026               |
| `ru` | Русский (Russian)                        | "вы" (lowercase)                                         | 1 234,56 €, 07.11.2026              |
| `ja` | 日本語 (Japanese)                        | です/ます sentences, noun-form labels                    | €1,234.56, 2026/11/7                |
| `zh` | 中文 (Simplified Chinese, mainland)      | "你"; full-width punctuation                             | €1,234.56, 2026/11/7                |
| `ko` | 한국어 (Korean)                          | 해요체 sentences, noun-form labels                       | €1,234.56, 2026. 11. 7.             |
| `hi` | हिन्दी (Hindi, Devanagari)                | "आप"; everyday words over Sanskritised ones              | €1,234.56, 7/11/2026                |

Arabic, Hebrew and other right-to-left languages are not supported yet: the layout has no RTL mode.

## How the message files work

- `messages/<locale>/<area>.json` holds one area's messages. Every locale has the same files and the same keys as `messages/en/`, and `npm test` fails if one is missing or extra.
- `app.json` holds messages only Kosha's phone apps show (keypad keys, the time wheel and so on). The Android and iOS apps build their strings from every area, so the web and the apps share one translation.
- Values are [inlang message format](https://inlang.com/m/reootnfj/plugin-inlang-messageFormat). Paraglide JS compiles them into `m.<key>()` functions in `src/paraglide/`.
- `{name}` is a variable and `{#tag}…{/tag}` is markup the code fills in (a link, bold text). Keep both exactly; move them anywhere in the sentence.
- A plural message is an array with `declarations`, `selectors` and `match`. Keep `declarations` and `selectors` as in English. The `match` keys must cover every [CLDR plural category](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html) of the language (`one`, `few`, `many`, `other`…), and `*` matches any category: `"countPlural=one": "…", "countPlural=*": "…"`. A missing category shows the raw key, and `npm test` checks every count in every language.
- Keep UI labels about as short as the English. Never translate Kosha, brand names, API, MCP, CSV, OFX, currency codes or keyboard keys.
- Search keywords (`*_kw`, `shell_page_*_keywords`) list the language's words plus the English ones, so searching in either works.
- Quick add reads amounts, `#tags`, account and category names locally. Example lines in `add.json` and `demos.json` should use the language's own account and category names; `today`/`yesterday` words for each language live in `DATES` in `src/lib/quick-add.ts`.

## Adding a language

1. Add the code to `locales` in `project.inlang/settings.json`.
2. Copy `messages/en/` to `messages/<code>/` and translate every value, using the glossary below. Add the language's terms as a new section under "Terms by language".
3. Add its `react-day-picker` locale to `DAY_PICKER_LOCALES` in `src/components/ui/calendar.tsx`, and its words for today and yesterday to `DATES` in `src/lib/quick-add.ts`.
4. Add a row to "Supported languages" above, then run `npm test`.

## Glossary

What each term means in Kosha. Pick one word per concept and use it everywhere.

| English                          | Meaning in Kosha                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Kosha                            | The app's name (Sanskrit for "treasury"). Never translated.                                              |
| account                          | A place money is kept: a bank account, cash, a credit card or an investment. Shown on the Accounts page. |
| Kosha account / your account     | The user's sign-in account, when it must be told apart from a money account.                             |
| sign in / sign out               | Log in / log out.                                                                                        |
| create an account / sign up      | Register a new Kosha account.                                                                            |
| demo account                     | The shared read-only account anyone can try.                                                             |
| transaction / entry              | One payment, income or transfer line. "Entry" is used in the reconcile and import screens.               |
| payee                            | Who was paid, or who paid you (shop, employer, person).                                                  |
| category                         | What a transaction was for: Groceries, Rent, Salary.                                                     |
| tag                              | A hashtag label on a transaction, such as `#work`.                                                       |
| event                            | A named date range, such as a trip, that groups everything added during it.                              |
| expense / spending               | Money going out.                                                                                         |
| income                           | Money coming in.                                                                                         |
| transfer                         | Money moved between two of the user's own accounts. Never income or spending.                            |
| transfer fee                     | The fee on a transfer or currency exchange. It counts as spending.                                       |
| correction                       | A neutral entry that fixes a balance.                                                                    |
| opening balance                  | What an account held before its first transaction in Kosha.                                              |
| balance                          | What an account holds now.                                                                               |
| statement                        | The file or paper a bank sends listing an account's transactions.                                        |
| statement balance                | The closing balance printed on a statement.                                                              |
| reconcile / reconciliation       | Checking Kosha's entries against a bank statement until both balances match.                             |
| reconciled                       | An entry checked against a statement.                                                                    |
| import                           | Bringing statements or another app's data into Kosha.                                                    |
| export                           | Downloading the user's data.                                                                             |
| net worth                        | Everything owned minus everything owed, across accounts and currencies.                                  |
| credit card                      | Account type. Kosha shows what is owed and the available credit.                                         |
| available credit                 | Credit limit minus what is owed.                                                                         |
| credit limit                     | The most a card can owe.                                                                                 |
| investment                       | Account type for funds and shares: money put in plus its gain.                                           |
| gain                             | How much an investment's value changed from what was put in.                                             |
| bank account                     | Account type for current and savings accounts.                                                           |
| cash                             | Notes and coins.                                                                                         |
| primary currency                 | The currency totals are shown in by default.                                                             |
| display currency                 | The currency picked in the header to view totals in.                                                     |
| exchange rate                    | Units of one currency per another, refreshed daily.                                                      |
| Overview                         | Main page: the month so far, net worth, bills.                                                           |
| Activity                         | Page listing transactions.                                                                               |
| Recurring                        | Page of recurring payments (also the nav label).                                                         |
| recurring payment / subscription | A payment on a schedule: rent, a salary, a streaming service.                                            |
| due                              | A recurring payment whose date has come.                                                                 |
| auto-pay                         | A recurring payment recorded automatically when due.                                                     |
| skip                             | Mark one payment of a schedule as not happening.                                                         |
| upcoming                         | Recurring payments still to come this month.                                                             |
| Add / quick add                  | Adding a transaction; quick add is the one-line entry box.                                               |
| usual pace                       | What the user normally spends by this day of the month.                                                  |
| projection                       | Where spending will likely end the month.                                                                |
| rule / payee rule                | Maps bank text or a payee to a name and category.                                                        |
| attachment / receipt / payslip   | A file on a transaction.                                                                                 |
| archive                          | Hide an account or category without deleting its history.                                                |
| Settings                         | The settings area.                                                                                       |
| General                          | Settings section.                                                                                        |
| Appearance                       | Settings section: theme, accent, density.                                                                |
| Profile                          | Settings section.                                                                                        |
| Sign-in & security               | Settings section.                                                                                        |
| Import & export                  | Settings section.                                                                                        |
| Delete & reset                   | Settings section that erases data.                                                                       |
| API & MCP                        | Settings section for API keys and connected apps.                                                        |
| passkey                          | Sign-in with the device's fingerprint, face or PIN.                                                      |
| two-factor authentication        | A code from an authenticator app at sign-in.                                                             |
| backup codes                     | One-time codes for when the authenticator is lost.                                                       |
| AI                               | Artificial intelligence features, off by default.                                                        |
| provider                         | The AI service the user connects (Anthropic, OpenAI…).                                                   |
| What AI can see                  | AI setting choosing which fields are sent.                                                               |
| Auto-categorise                  | AI feature that picks a category for an unknown payee.                                                   |
| Natural-language add             | AI feature that reads a typed sentence into a transaction.                                               |
| Receipt scanning                 | AI feature that reads a receipt photo.                                                                   |
| Monthly recap                    | AI note on Overview about last month.                                                                    |
| Ask Kosha / Ask                  | AI chat about the user's money (nav label "Ask").                                                        |
| hide amounts                     | Privacy setting that blurs amounts.                                                                      |
| Balance correction               | The category of correction entries, and its default name.                                                |
| Reconciliation adjustment        | The correction a reconciliation adds to make balances meet.                                              |
| tick / ticked                    | Marking an entry as present on the statement while reconciling.                                          |
| difference                       | What is left between Kosha and a statement while reconciling.                                            |
| money in / money out             | Statement columns or totals for credits and debits.                                                      |
| owed                             | What is owed on a credit card (field label / short note).                                                |
| current account                  | Everyday bank account.                                                                                   |
| market rate                      | The mid-market exchange rate a provider's rate is compared with.                                         |
| fee                              | Charged on a transfer or exchange.                                                                       |
| Out / In / Net                   | Activity totals.                                                                                         |
| bill                             | A recurring payment of the "bill" kind.                                                                  |
| Make recurring                   | Turn spotted payments into a recurring payment.                                                          |
| Needs attention                  | Overview card of things to act on.                                                                       |
| Coming up                        | Upcoming recurring payments.                                                                             |
| Default account                  | Account preselected when adding.                                                                         |
| Payee rules                      | Settings section of rules.                                                                               |
| Theme / Accent colour / Density  | Appearance settings.                                                                                     |
| Keyboard shortcuts               | List in the account menu.                                                                                |
| API key                          | A key for the public API.                                                                                |
| Connected apps                   | Apps signed in over MCP.                                                                                 |
| Request log                      | The 30-day log of AI requests.                                                                           |
| Use AI features                  | The main AI switch.                                                                                      |
| look-up                          | One data query Ask Kosha makes.                                                                          |
| endpoint                         | A custom AI provider URL.                                                                                |
| Signed-in devices                | Sessions list in security settings.                                                                      |
| authenticator app                | App that makes two-factor codes.                                                                         |
| Delete account                   | Erase the Kosha account (not a money account).                                                           |
| privacy policy / terms           | The legal pages.                                                                                         |
| self-hosted copy                 | Someone running their own Kosha.                                                                         |
| Install / Reload                 | App install and update prompts.                                                                          |
| tagline                          | Jot down what you spent. Know where it went.                                                             |

## Terms by language

### Deutsch (`de`)

| English                          | Deutsch                                    |
| -------------------------------- | ------------------------------------------ |
| Kosha                            | Kosha                                      |
| account                          | Konto (pl. Konten)                         |
| Kosha account / your account     | Kosha-Konto                                |
| sign in / sign out               | anmelden / abmelden                        |
| create an account / sign up      | Konto erstellen / registrieren             |
| demo account                     | Demokonto                                  |
| transaction / entry              | Buchung                                    |
| payee                            | Zahlungspartner                            |
| category                         | Kategorie                                  |
| tag                              | Schlagwort (pl. Schlagwörter)              |
| event                            | Ereignis                                   |
| expense / spending               | Ausgabe / Ausgaben                         |
| income                           | Einnahmen                                  |
| transfer                         | Umbuchung                                  |
| transfer fee                     | Umbuchungsgebühr                           |
| correction                       | Korrektur                                  |
| opening balance                  | Anfangssaldo                               |
| balance                          | Kontostand                                 |
| statement                        | Kontoauszug                                |
| statement balance                | Saldo laut Kontoauszug                     |
| reconcile / reconciliation       | abgleichen / Abgleich                      |
| reconciled                       | abgeglichen                                |
| import                           | importieren / Import                       |
| export                           | exportieren / Export                       |
| net worth                        | Vermögen                                   |
| credit card                      | Kreditkarte                                |
| available credit                 | verfügbarer Kreditrahmen                   |
| credit limit                     | Kreditlimit                                |
| investment                       | Geldanlage                                 |
| gain                             | Wertentwicklung                            |
| bank account                     | Bankkonto                                  |
| cash                             | Bargeld                                    |
| primary currency                 | Hauptwährung                               |
| display currency                 | Anzeigewährung                             |
| exchange rate                    | Wechselkurs                                |
| Overview                         | Übersicht                                  |
| Activity                         | Aktivität                                  |
| Recurring                        | Wiederkehrend                              |
| recurring payment / subscription | wiederkehrende Zahlung / Abo               |
| due                              | fällig                                     |
| auto-pay                         | automatisch zahlen                         |
| skip                             | überspringen                               |
| upcoming                         | anstehend                                  |
| Add / quick add                  | Hinzufügen / Schnelleingabe                |
| usual pace                       | übliches Tempo                             |
| projection                       | Prognose                                   |
| rule / payee rule                | Regel / Zahlungspartner-Regel              |
| attachment / receipt / payslip   | Anhang / Beleg / Gehaltsabrechnung         |
| archive                          | archivieren                                |
| Settings                         | Einstellungen                              |
| General                          | Allgemein                                  |
| Appearance                       | Darstellung                                |
| Profile                          | Profil                                     |
| Sign-in & security               | Anmeldung & Sicherheit                     |
| Import & export                  | Import & Export                            |
| Delete & reset                   | Löschen & Zurücksetzen                     |
| API & MCP                        | API & MCP                                  |
| passkey                          | Passkey                                    |
| two-factor authentication        | Zwei-Faktor-Authentifizierung              |
| backup codes                     | Backup-Codes                               |
| AI                               | KI                                         |
| provider                         | Anbieter                                   |
| What AI can see                  | Was die KI sieht                           |
| Auto-categorise                  | Automatisch kategorisieren                 |
| Natural-language add             | Eingabe in eigenen Worten                  |
| Receipt scanning                 | Belege scannen                             |
| Monthly recap                    | Monatsrückblick                            |
| Ask Kosha / Ask                  | Frag Kosha / Fragen                        |
| hide amounts                     | Beträge ausblenden                         |
| Balance correction               | Saldokorrektur                             |
| Reconciliation adjustment        | Abgleichskorrektur                         |
| tick / ticked                    | abhaken / abgehakt                         |
| difference                       | Differenz                                  |
| money in / money out             | Gutschrift / Belastung                     |
| owed                             | Offener Betrag / offen                     |
| current account                  | Girokonto                                  |
| market rate                      | Marktkurs                                  |
| fee                              | Gebühr                                     |
| Out / In / Net                   | Ausgaben / Einnahmen / Netto               |
| bill                             | Rechnung                                   |
| Make recurring                   | Als wiederkehrend anlegen                  |
| Needs attention                  | Zu erledigen                               |
| Coming up                        | Demnächst                                  |
| Default account                  | Standardkonto                              |
| Payee rules                      | Zahlungspartner-Regeln                     |
| Theme / Accent colour / Density  | Design / Akzentfarbe / Dichte              |
| Keyboard shortcuts               | Tastenkürzel                               |
| API key                          | API-Schlüssel                              |
| Connected apps                   | Verbundene Apps                            |
| Request log                      | Anfrageprotokoll                           |
| Use AI features                  | KI-Funktionen nutzen                       |
| look-up                          | Abfrage                                    |
| endpoint                         | Endpunkt                                   |
| Signed-in devices                | Angemeldete Geräte                         |
| authenticator app                | Authenticator-App                          |
| Delete account                   | Kosha-Konto löschen                        |
| privacy policy / terms           | Datenschutzerklärung / Nutzungsbedingungen |
| self-hosted copy                 | eigene Instanz                             |
| Install / Reload                 | Installieren / Neu laden                   |
| tagline                          | Ausgabe notiert. Monat kapiert.            |

### Español (`es`)

| English                          | Español                                         |
| -------------------------------- | ----------------------------------------------- |
| Kosha                            | Kosha                                           |
| account                          | cuenta                                          |
| Kosha account / your account     | cuenta de Kosha                                 |
| sign in / sign out               | iniciar sesión / cerrar sesión                  |
| create an account / sign up      | crear una cuenta / registrarse                  |
| demo account                     | cuenta demo                                     |
| transaction / entry              | movimiento                                      |
| payee                            | beneficiario                                    |
| category                         | categoría                                       |
| tag                              | etiqueta                                        |
| event                            | evento                                          |
| expense / spending               | gasto / gastos                                  |
| income                           | ingresos                                        |
| transfer                         | transferencia                                   |
| transfer fee                     | comisión de transferencia                       |
| correction                       | corrección                                      |
| opening balance                  | saldo inicial                                   |
| balance                          | saldo                                           |
| statement                        | extracto                                        |
| statement balance                | saldo del extracto                              |
| reconcile / reconciliation       | conciliar / conciliación                        |
| reconciled                       | conciliado                                      |
| import                           | importar / importación                          |
| export                           | exportar / exportación                          |
| net worth                        | patrimonio neto                                 |
| credit card                      | tarjeta de crédito                              |
| available credit                 | crédito disponible                              |
| credit limit                     | límite de crédito                               |
| investment                       | inversión                                       |
| gain                             | rendimiento                                     |
| bank account                     | cuenta bancaria                                 |
| cash                             | efectivo                                        |
| primary currency                 | moneda principal                                |
| display currency                 | moneda de visualización                         |
| exchange rate                    | tipo de cambio                                  |
| Overview                         | Resumen                                         |
| Activity                         | Actividad                                       |
| Recurring                        | Recurrentes                                     |
| recurring payment / subscription | pago recurrente / suscripción                   |
| due                              | vence / vencido                                 |
| auto-pay                         | pago automático                                 |
| skip                             | omitir                                          |
| upcoming                         | próximo                                         |
| Add / quick add                  | Añadir / entrada rápida                         |
| usual pace                       | ritmo habitual                                  |
| projection                       | proyección                                      |
| rule / payee rule                | regla / regla de beneficiario                   |
| attachment / receipt / payslip   | adjunto / recibo / nómina                       |
| archive                          | archivar                                        |
| Settings                         | Ajustes                                         |
| General                          | General                                         |
| Appearance                       | Apariencia                                      |
| Profile                          | Perfil                                          |
| Sign-in & security               | Inicio de sesión y seguridad                    |
| Import & export                  | Importar y exportar                             |
| Delete & reset                   | Borrar y restablecer                            |
| API & MCP                        | API y MCP                                       |
| passkey                          | llave de acceso                                 |
| two-factor authentication        | verificación en dos pasos                       |
| backup codes                     | códigos de respaldo                             |
| AI                               | IA                                              |
| provider                         | proveedor                                       |
| What AI can see                  | Lo que ve la IA                                 |
| Auto-categorise                  | Categorizar automáticamente                     |
| Natural-language add             | Añadir con tus palabras                         |
| Receipt scanning                 | Escanear recibos                                |
| Monthly recap                    | Repaso del mes                                  |
| Ask Kosha / Ask                  | Pregunta a Kosha / Preguntar                    |
| hide amounts                     | ocultar importes                                |
| Balance correction               | Corrección de saldo                             |
| Reconciliation adjustment        | Ajuste de conciliación                          |
| tick / ticked                    | marcar / marcado                                |
| difference                       | diferencia                                      |
| money in / money out             | entradas / salidas                              |
| owed                             | adeudado                                        |
| current account                  | cuenta corriente                                |
| market rate                      | tipo de mercado                                 |
| fee                              | comisión                                        |
| Out / In / Net                   | Salidas / Entradas / Neto                       |
| bill                             | factura                                         |
| Make recurring                   | Hacer recurrente                                |
| Needs attention                  | Requiere atención                               |
| Coming up                        | Próximamente                                    |
| Default account                  | Cuenta predeterminada                           |
| Payee rules                      | Reglas de beneficiarios                         |
| Theme / Accent colour / Density  | Tema / Color de acento / Densidad               |
| Keyboard shortcuts               | Atajos de teclado                               |
| API key                          | clave de API                                    |
| Connected apps                   | Apps conectadas                                 |
| Request log                      | Registro de solicitudes                         |
| Use AI features                  | Usar funciones de IA                            |
| look-up                          | consulta                                        |
| endpoint                         | endpoint                                        |
| Signed-in devices                | Dispositivos con sesión iniciada                |
| authenticator app                | app de autenticación                            |
| Delete account                   | Eliminar cuenta de Kosha                        |
| privacy policy / terms           | política de privacidad / términos               |
| self-hosted copy                 | instancia propia                                |
| Install / Reload                 | Instalar / Recargar                             |
| tagline                          | Anota lo que gastaste. Sabrás dónde lo dejaste. |

### Français (`fr`)

| English                          | Français                                                |
| -------------------------------- | ------------------------------------------------------- |
| Kosha                            | Kosha                                                   |
| account                          | compte (pl. comptes)                                    |
| Kosha account / your account     | compte Kosha                                            |
| sign in / sign out               | se connecter / se déconnecter                           |
| create an account / sign up      | créer un compte / s'inscrire                            |
| demo account                     | compte de démo                                          |
| transaction / entry              | opération                                               |
| payee                            | tiers                                                   |
| category                         | catégorie                                               |
| tag                              | étiquette (pl. étiquettes)                              |
| event                            | événement                                               |
| expense / spending               | dépense / dépenses                                      |
| income                           | revenus                                                 |
| transfer                         | virement                                                |
| transfer fee                     | frais de virement                                       |
| correction                       | correction                                              |
| opening balance                  | solde initial                                           |
| balance                          | solde                                                   |
| statement                        | relevé                                                  |
| statement balance                | solde du relevé                                         |
| reconcile / reconciliation       | rapprocher / rapprochement                              |
| reconciled                       | rapproché(e)                                            |
| import                           | importer / import                                       |
| export                           | exporter / export                                       |
| net worth                        | patrimoine                                              |
| credit card                      | carte de crédit                                         |
| available credit                 | crédit disponible                                       |
| credit limit                     | plafond de crédit                                       |
| investment                       | placement                                               |
| gain                             | plus-value                                              |
| bank account                     | compte bancaire                                         |
| cash                             | espèces                                                 |
| primary currency                 | devise principale                                       |
| display currency                 | devise d'affichage                                      |
| exchange rate                    | taux de change                                          |
| Overview                         | Aperçu                                                  |
| Activity                         | Activité                                                |
| Recurring                        | Récurrents                                              |
| recurring payment / subscription | paiement récurrent / abonnement                         |
| due                              | à payer                                                 |
| auto-pay                         | paiement automatique                                    |
| skip                             | ignorer                                                 |
| upcoming                         | à venir                                                 |
| Add / quick add                  | Ajouter / saisie rapide                                 |
| usual pace                       | rythme habituel                                         |
| projection                       | prévision                                               |
| rule / payee rule                | règle / règle de tiers                                  |
| attachment / receipt / payslip   | pièce jointe / reçu / fiche de paie                     |
| archive                          | archiver                                                |
| Settings                         | Paramètres                                              |
| General                          | Général                                                 |
| Appearance                       | Apparence                                               |
| Profile                          | Profil                                                  |
| Sign-in & security               | Connexion et sécurité                                   |
| Import & export                  | Import et export                                        |
| Delete & reset                   | Supprimer et réinitialiser                              |
| API & MCP                        | API et MCP                                              |
| passkey                          | clé d'accès                                             |
| two-factor authentication        | double authentification                                 |
| backup codes                     | codes de secours                                        |
| AI                               | IA                                                      |
| provider                         | fournisseur                                             |
| What AI can see                  | Ce que l'IA voit                                        |
| Auto-categorise                  | Catégorisation automatique                              |
| Natural-language add             | Saisie en langage naturel                               |
| Receipt scanning                 | Scan des reçus                                          |
| Monthly recap                    | Bilan mensuel                                           |
| Ask Kosha / Ask                  | Demander à Kosha / Demander                             |
| hide amounts                     | masquer les montants                                    |
| Balance correction               | Correction de solde                                     |
| Reconciliation adjustment        | Ajustement de rapprochement                             |
| tick / ticked                    | cocher / coché                                          |
| difference                       | écart                                                   |
| money in / money out             | crédit / débit                                          |
| owed                             | montant dû / dû                                         |
| current account                  | compte courant                                          |
| market rate                      | taux du marché                                          |
| fee                              | frais                                                   |
| Out / In / Net                   | Sorties / Entrées / Net                                 |
| bill                             | facture                                                 |
| Make recurring                   | Rendre récurrent                                        |
| Needs attention                  | À traiter                                               |
| Coming up                        | À venir                                                 |
| Default account                  | Compte par défaut                                       |
| Payee rules                      | Règles de tiers                                         |
| Theme / Accent colour / Density  | Thème / Couleur d'accent / Densité                      |
| Keyboard shortcuts               | Raccourcis clavier                                      |
| API key                          | clé API                                                 |
| Connected apps                   | Applications connectées                                 |
| Request log                      | Journal des requêtes                                    |
| Use AI features                  | Utiliser les fonctions d'IA                             |
| look-up                          | recherche                                               |
| endpoint                         | endpoint                                                |
| Signed-in devices                | Appareils connectés                                     |
| authenticator app                | application d'authentification                          |
| Delete account                   | Supprimer le compte Kosha                               |
| privacy policy / terms           | politique de confidentialité / conditions d'utilisation |
| self-hosted copy                 | instance auto-hébergée                                  |
| Install / Reload                 | Installer / Recharger                                   |
| tagline                          | Notez ce que vous dépensez. Voyez où c'est passé.       |

### Português (`pt`)

| English                          | Português                               |
| -------------------------------- | --------------------------------------- |
| Kosha                            | Kosha (o Kosha)                         |
| account                          | conta (pl. contas)                      |
| Kosha account / your account     | conta Kosha                             |
| sign in / sign out               | entrar / sair (subst.: login)           |
| create an account / sign up      | criar conta / cadastrar-se              |
| demo account                     | conta demo                              |
| transaction / entry              | transação / lançamento                  |
| payee                            | favorecido                              |
| category                         | categoria                               |
| tag                              | tag (pl. tags)                          |
| event                            | evento                                  |
| expense / spending               | despesa / gastos                        |
| income                           | receita (pl. receitas)                  |
| transfer                         | transferência                           |
| transfer fee                     | taxa de transferência                   |
| correction                       | ajuste                                  |
| opening balance                  | saldo inicial                           |
| balance                          | saldo                                   |
| statement                        | extrato                                 |
| statement balance                | saldo do extrato                        |
| reconcile / reconciliation       | conciliar / conciliação                 |
| reconciled                       | conciliado                              |
| import                           | importar / importação                   |
| export                           | exportar / exportação                   |
| net worth                        | patrimônio                              |
| credit card                      | cartão de crédito                       |
| available credit                 | limite disponível                       |
| credit limit                     | limite de crédito                       |
| investment                       | investimento                            |
| gain                             | rendimento                              |
| bank account                     | conta bancária                          |
| cash                             | dinheiro                                |
| primary currency                 | moeda principal                         |
| display currency                 | moeda de exibição                       |
| exchange rate                    | taxa de câmbio                          |
| Overview                         | Visão geral                             |
| Activity                         | Atividade                               |
| Recurring                        | Recorrentes                             |
| recurring payment / subscription | pagamento recorrente / assinatura       |
| due                              | a vencer / vence                        |
| auto-pay                         | registrar pagamentos automaticamente    |
| skip                             | pular                                   |
| upcoming                         | próximo                                 |
| Add / quick add                  | Adicionar / adição rápida               |
| usual pace                       | ritmo habitual                          |
| projection                       | projeção                                |
| rule / payee rule                | regra / regra de favorecido             |
| attachment / receipt / payslip   | anexo / recibo / holerite               |
| archive                          | arquivar                                |
| Settings                         | Configurações                           |
| General                          | Geral                                   |
| Appearance                       | Aparência                               |
| Profile                          | Perfil                                  |
| Sign-in & security               | Login e segurança                       |
| Import & export                  | Importar e exportar                     |
| Delete & reset                   | Excluir e redefinir                     |
| API & MCP                        | API e MCP                               |
| passkey                          | chave de acesso                         |
| two-factor authentication        | autenticação de dois fatores            |
| backup codes                     | códigos de backup                       |
| AI                               | IA                                      |
| provider                         | provedor                                |
| What AI can see                  | O que a IA pode ver                     |
| Auto-categorise                  | Categorizar automaticamente             |
| Natural-language add             | Adicionar com suas palavras             |
| Receipt scanning                 | Leitura de recibos                      |
| Monthly recap                    | Resumo do mês                           |
| Ask Kosha / Ask                  | Pergunte ao Kosha / Perguntar           |
| hide amounts                     | ocultar valores                         |
| Balance correction               | Ajuste de saldo                         |
| Reconciliation adjustment        | Ajuste de conciliação                   |
| tick / ticked                    | marcar / marcado                        |
| difference                       | diferença                               |
| money in / money out             | entradas / saídas                       |
| owed                             | valor devido / devido                   |
| current account                  | conta corrente                          |
| market rate                      | cotação de mercado                      |
| fee                              | taxa                                    |
| Out / In / Net                   | Saídas / Entradas / Líquido             |
| bill                             | despesa fixa                            |
| Make recurring                   | Tornar recorrente                       |
| Needs attention                  | Precisa de atenção                      |
| Coming up                        | Próximos                                |
| Default account                  | Conta padrão                            |
| Payee rules                      | Regras de favorecidos                   |
| Theme / Accent colour / Density  | Tema / Cor de destaque / Densidade      |
| Keyboard shortcuts               | Atalhos de teclado                      |
| API key                          | chave de API                            |
| Connected apps                   | Apps conectados                         |
| Request log                      | Registro de solicitações                |
| Use AI features                  | Usar recursos de IA                     |
| look-up                          | consulta                                |
| endpoint                         | endpoint                                |
| Signed-in devices                | Dispositivos conectados                 |
| authenticator app                | app autenticador                        |
| Delete account                   | Excluir conta Kosha                     |
| privacy policy / terms           | política de privacidade / termos de uso |
| self-hosted copy                 | instância própria                       |
| Install / Reload                 | Instalar / Recarregar                   |
| tagline                          | Anote o que gastou. Saiba onde parou.   |

### Italiano (`it`)

| English                          | Italiano                                        |
| -------------------------------- | ----------------------------------------------- |
| Kosha                            | Kosha                                           |
| account                          | conto (pl. conti)                               |
| Kosha account / your account     | account Kosha / il tuo account                  |
| sign in / sign out               | accedi / esci (accesso / disconnessione)        |
| create an account / sign up      | crea un account / registrati                    |
| demo account                     | account demo                                    |
| transaction / entry              | movimento (pl. movimenti)                       |
| payee                            | beneficiario (pl. beneficiari)                  |
| category                         | categoria                                       |
| tag                              | tag                                             |
| event                            | evento                                          |
| expense / spending               | spesa / spese                                   |
| income                           | entrata / entrate                               |
| transfer                         | giroconto (pl. giroconti)                       |
| transfer fee                     | commissione giroconto                           |
| correction                       | correzione                                      |
| opening balance                  | saldo iniziale                                  |
| balance                          | saldo                                           |
| statement                        | estratto conto (pl. estratti conto)             |
| statement balance                | saldo dell'estratto conto                       |
| reconcile / reconciliation       | riconciliare / riconciliazione                  |
| reconciled                       | riconciliato                                    |
| import                           | importare / importazione                        |
| export                           | esportare / esportazione                        |
| net worth                        | patrimonio netto                                |
| credit card                      | carta di credito                                |
| available credit                 | credito disponibile                             |
| credit limit                     | limite di credito                               |
| investment                       | investimento                                    |
| gain                             | rendimento                                      |
| bank account                     | conto bancario                                  |
| cash                             | contanti                                        |
| primary currency                 | valuta principale                               |
| display currency                 | valuta di visualizzazione                       |
| exchange rate                    | tasso di cambio                                 |
| Overview                         | Panoramica                                      |
| Activity                         | Attività                                        |
| Recurring                        | Ricorrenti                                      |
| recurring payment / subscription | pagamento ricorrente / abbonamento              |
| due                              | da pagare                                       |
| auto-pay                         | registra in automatico                          |
| skip                             | saltare                                         |
| upcoming                         | in arrivo                                       |
| Add / quick add                  | Aggiungi / aggiunta rapida                      |
| usual pace                       | ritmo abituale                                  |
| projection                       | previsione                                      |
| rule / payee rule                | regola / regola beneficiario                    |
| attachment / receipt / payslip   | allegato / ricevuta / busta paga                |
| archive                          | archiviare                                      |
| Settings                         | Impostazioni                                    |
| General                          | Generali                                        |
| Appearance                       | Aspetto                                         |
| Profile                          | Profilo                                         |
| Sign-in & security               | Accesso e sicurezza                             |
| Import & export                  | Importa ed esporta                              |
| Delete & reset                   | Elimina e reimposta                             |
| API & MCP                        | API e MCP                                       |
| passkey                          | passkey                                         |
| two-factor authentication        | autenticazione a due fattori                    |
| backup codes                     | codici di backup                                |
| AI                               | IA                                              |
| provider                         | fornitore                                       |
| What AI can see                  | Cosa vede l'IA                                  |
| Auto-categorise                  | Categorizzazione automatica                     |
| Natural-language add             | Aggiunta in parole tue                          |
| Receipt scanning                 | Scansione ricevute                              |
| Monthly recap                    | Riepilogo mensile                               |
| Ask Kosha / Ask                  | Chiedi a Kosha / Chiedi                         |
| hide amounts                     | nascondi importi                                |
| Balance correction               | Correzione saldo                                |
| Reconciliation adjustment        | Rettifica di riconciliazione                    |
| tick / ticked                    | spuntare / spuntato                             |
| difference                       | differenza                                      |
| money in / money out             | entrate / uscite                                |
| owed                             | importo dovuto / da saldare                     |
| current account                  | conto corrente                                  |
| market rate                      | tasso di mercato                                |
| fee                              | commissione                                     |
| Out / In / Net                   | Uscite / Entrate / Netto                        |
| bill                             | bolletta                                        |
| Make recurring                   | Rendi ricorrente                                |
| Needs attention                  | Da sistemare                                    |
| Coming up                        | In arrivo                                       |
| Default account                  | Conto predefinito                               |
| Payee rules                      | Regole beneficiari                              |
| Theme / Accent colour / Density  | Tema / Colore d'accento / Densità               |
| Keyboard shortcuts               | Scorciatoie da tastiera                         |
| API key                          | chiave API                                      |
| Connected apps                   | App collegate                                   |
| Request log                      | Registro richieste                              |
| Use AI features                  | Usa le funzioni IA                              |
| look-up                          | ricerca                                         |
| endpoint                         | endpoint                                        |
| Signed-in devices                | Dispositivi connessi                            |
| authenticator app                | app di autenticazione                           |
| Delete account                   | Elimina account                                 |
| privacy policy / terms           | informativa sulla privacy / termini di servizio |
| self-hosted copy                 | istanza self-hosted (la tua istanza)            |
| Install / Reload                 | Installa / Ricarica                             |
| tagline                          | Annota ogni spesa. Nessuna sorpresa.            |

### Nederlands (`nl`)

| English                          | Nederlands                              |
| -------------------------------- | --------------------------------------- |
| Kosha                            | Kosha                                   |
| account                          | rekening (mv. rekeningen)               |
| Kosha account / your account     | Kosha-account / je account              |
| sign in / sign out               | inloggen / uitloggen                    |
| create an account / sign up      | account aanmaken / registreren          |
| demo account                     | demo-account                            |
| transaction / entry              | transactie                              |
| payee                            | tegenpartij                             |
| category                         | categorie                               |
| tag                              | tag (mv. tags)                          |
| event                            | evenement                               |
| expense / spending               | uitgave / uitgaven                      |
| income                           | inkomsten                               |
| transfer                         | overboeking                             |
| transfer fee                     | overboekingskosten                      |
| correction                       | correctie                               |
| opening balance                  | beginsaldo                              |
| balance                          | saldo                                   |
| statement                        | afschrift                               |
| statement balance                | saldo op afschrift                      |
| reconcile / reconciliation       | afstemmen / afstemming                  |
| reconciled                       | afgestemd                               |
| import                           | importeren / import                     |
| export                           | exporteren / export                     |
| net worth                        | vermogen                                |
| credit card                      | creditcard                              |
| available credit                 | beschikbaar krediet                     |
| credit limit                     | kredietlimiet                           |
| investment                       | belegging                               |
| gain                             | rendement                               |
| bank account                     | bankrekening                            |
| cash                             | contant geld                            |
| primary currency                 | hoofdvaluta                             |
| display currency                 | weergavevaluta                          |
| exchange rate                    | wisselkoers                             |
| Overview                         | Overzicht                               |
| Activity                         | Activiteit                              |
| Recurring                        | Terugkerend                             |
| recurring payment / subscription | terugkerende betaling / abonnement      |
| due                              | te betalen                              |
| auto-pay                         | automatisch vastleggen                  |
| skip                             | overslaan                               |
| upcoming                         | aankomend                               |
| Add / quick add                  | Toevoegen / snel toevoegen              |
| usual pace                       | gebruikelijke tempo                     |
| projection                       | prognose                                |
| rule / payee rule                | regel / tegenpartijregel                |
| attachment / receipt / payslip   | bijlage / bonnetje / loonstrook         |
| archive                          | archiveren                              |
| Settings                         | Instellingen                            |
| General                          | Algemeen                                |
| Appearance                       | Weergave                                |
| Profile                          | Profiel                                 |
| Sign-in & security               | Inloggen & beveiliging                  |
| Import & export                  | Import & export                         |
| Delete & reset                   | Verwijderen & resetten                  |
| API & MCP                        | API & MCP                               |
| passkey                          | passkey                                 |
| two-factor authentication        | tweestapsverificatie                    |
| backup codes                     | back-upcodes                            |
| AI                               | AI                                      |
| provider                         | aanbieder                               |
| What AI can see                  | Wat AI kan zien                         |
| Auto-categorise                  | Automatisch categoriseren               |
| Natural-language add             | Invoeren in je eigen woorden            |
| Receipt scanning                 | Bonnetjes scannen                       |
| Monthly recap                    | Maandterugblik                          |
| Ask Kosha / Ask                  | Vraag Kosha / Vragen                    |
| hide amounts                     | bedragen verbergen                      |
| Balance correction               | Saldocorrectie                          |
| Reconciliation adjustment        | Afstemmingscorrectie                    |
| tick / ticked                    | afvinken / afgevinkt                    |
| difference                       | verschil                                |
| money in / money out             | bij / af                                |
| owed                             | openstaand                              |
| current account                  | betaalrekening                          |
| market rate                      | marktkoers                              |
| fee                              | kosten                                  |
| Out / In / Net                   | Uit / In / Netto                        |
| bill                             | vaste last (mv. vaste lasten)           |
| Make recurring                   | Terugkerend maken                       |
| Needs attention                  | Actie nodig                             |
| Coming up                        | Binnenkort                              |
| Default account                  | Standaardrekening                       |
| Payee rules                      | Tegenpartijregels                       |
| Theme / Accent colour / Density  | Thema / Accentkleur / Dichtheid         |
| Keyboard shortcuts               | Sneltoetsen                             |
| API key                          | API-sleutel                             |
| Connected apps                   | Gekoppelde apps                         |
| Request log                      | Verzoeklogboek                          |
| Use AI features                  | AI-functies gebruiken                   |
| look-up                          | opzoeking                               |
| endpoint                         | endpoint                                |
| Signed-in devices                | Ingelogde apparaten                     |
| authenticator app                | authenticator-app                       |
| Delete account                   | Account verwijderen                     |
| privacy policy / terms           | privacybeleid / gebruiksvoorwaarden     |
| self-hosted copy                 | eigen installatie                       |
| Install / Reload                 | Installeren / Opnieuw laden             |
| tagline                          | Uitgave genoteerd. Maand gecontroleerd. |

### Русский (`ru`)

| English                          | Русский                                             |
| -------------------------------- | --------------------------------------------------- |
| Kosha                            | Kosha                                               |
| account                          | счёт (мн. счета)                                    |
| Kosha account / your account     | аккаунт Kosha / ваш аккаунт                         |
| sign in / sign out               | войти / выйти                                       |
| create an account / sign up      | создать аккаунт / зарегистрироваться                |
| demo account                     | демо-аккаунт                                        |
| transaction / entry              | операция                                            |
| payee                            | контрагент                                          |
| category                         | категория                                           |
| tag                              | тег                                                 |
| event                            | событие                                             |
| expense / spending               | расход / расходы                                    |
| income                           | доход / доходы                                      |
| transfer                         | перевод                                             |
| transfer fee                     | комиссия за перевод                                 |
| correction                       | корректировка                                       |
| opening balance                  | начальный остаток                                   |
| balance                          | баланс                                              |
| statement                        | выписка                                             |
| statement balance                | баланс по выписке                                   |
| reconcile / reconciliation       | сверить / сверка                                    |
| reconciled                       | сверено                                             |
| import                           | импортировать / импорт                              |
| export                           | экспортировать / экспорт                            |
| net worth                        | капитал                                             |
| credit card                      | кредитная карта                                     |
| available credit                 | доступный кредит (доступно)                         |
| credit limit                     | кредитный лимит                                     |
| investment                       | инвестиции                                          |
| gain                             | прирост (нереализованная прибыль / убыток)          |
| bank account                     | банковский счёт                                     |
| cash                             | наличные                                            |
| primary currency                 | основная валюта                                     |
| display currency                 | валюта отображения                                  |
| exchange rate                    | курс (валюты)                                       |
| Overview                         | Обзор                                               |
| Activity                         | Операции                                            |
| Recurring                        | Регулярные                                          |
| recurring payment / subscription | регулярный платёж / подписка                        |
| due                              | к оплате (срок оплаты)                              |
| auto-pay                         | записывать платежи автоматически                    |
| skip                             | пропустить                                          |
| upcoming                         | предстоящий                                         |
| Add / quick add                  | Добавить / быстрый ввод                             |
| usual pace                       | обычный темп                                        |
| projection                       | прогноз                                             |
| rule / payee rule                | правило / правило для контрагента                   |
| attachment / receipt / payslip   | вложение / чек / расчётный лист                     |
| archive                          | в архив / архивировать                              |
| Settings                         | Настройки                                           |
| General                          | Общие                                               |
| Appearance                       | Оформление                                          |
| Profile                          | Профиль                                             |
| Sign-in & security               | Вход и безопасность                                 |
| Import & export                  | Импорт и экспорт                                    |
| Delete & reset                   | Удаление и сброс                                    |
| API & MCP                        | API и MCP                                           |
| passkey                          | ключ доступа                                        |
| two-factor authentication        | двухфакторная аутентификация                        |
| backup codes                     | резервные коды                                      |
| AI                               | ИИ                                                  |
| provider                         | провайдер                                           |
| What AI can see                  | Что видит ИИ                                        |
| Auto-categorise                  | Автокатегоризация                                   |
| Natural-language add             | Ввод своими словами                                 |
| Receipt scanning                 | Сканирование чеков                                  |
| Monthly recap                    | Итоги месяца                                        |
| Ask Kosha / Ask                  | Спросить Kosha / Спросить                           |
| hide amounts                     | скрыть суммы                                        |
| Balance correction               | Корректировка баланса                               |
| Reconciliation adjustment        | Корректировка сверки                                |
| tick / ticked                    | отметить / отмечено                                 |
| difference                       | разница                                             |
| money in / money out             | поступления / списания                              |
| owed                             | задолженность                                       |
| current account                  | текущий счёт                                        |
| market rate                      | рыночный курс                                       |
| fee                              | комиссия                                            |
| Out / In / Net                   | Списания / Поступления / Итого                      |
| bill                             | обязательный платёж                                 |
| Make recurring                   | Сделать регулярным                                  |
| Needs attention                  | Требует внимания                                    |
| Coming up                        | Скоро                                               |
| Default account                  | Счёт по умолчанию                                   |
| Payee rules                      | Правила контрагентов                                |
| Theme / Accent colour / Density  | Тема / Акцентный цвет / Плотность                   |
| Keyboard shortcuts               | Сочетания клавиш                                    |
| API key                          | API-ключ                                            |
| Connected apps                   | Подключённые приложения                             |
| Request log                      | Журнал запросов                                     |
| Use AI features                  | Использовать функции ИИ                             |
| look-up                          | запрос к данным                                     |
| endpoint                         | эндпоинт                                            |
| Signed-in devices                | Устройства со входом                                |
| authenticator app                | приложение-аутентификатор                           |
| Delete account                   | Удалить аккаунт                                     |
| privacy policy / terms           | политика конфиденциальности / условия использования |
| self-hosted copy                 | собственный экземпляр                               |
| Install / Reload                 | Установить / Перезагрузить                          |
| tagline                          | Потратили — записали. Куда ушло — узнали.           |

### 日本語 (`ja`)

| English                          | 日本語                               |
| -------------------------------- | ------------------------------------ |
| Kosha                            | Kosha                                |
| account                          | 口座                                 |
| Kosha account / your account     | Koshaアカウント / アカウント         |
| sign in / sign out               | ログイン / ログアウト                |
| create an account / sign up      | アカウントを作成 / 新規登録          |
| demo account                     | デモアカウント                       |
| transaction / entry              | 取引                                 |
| payee                            | 取引先                               |
| category                         | カテゴリ                             |
| tag                              | タグ                                 |
| event                            | イベント                             |
| expense / spending               | 支出                                 |
| income                           | 収入                                 |
| transfer                         | 振替                                 |
| transfer fee                     | 振替手数料                           |
| correction                       | 修正                                 |
| opening balance                  | 開始残高                             |
| balance                          | 残高                                 |
| statement                        | 明細                                 |
| statement balance                | 明細の残高                           |
| reconcile / reconciliation       | 照合する / 照合                      |
| reconciled                       | 照合済み                             |
| import                           | インポート                           |
| export                           | エクスポート                         |
| net worth                        | 純資産                               |
| credit card                      | クレジットカード                     |
| available credit                 | 利用可能額                           |
| credit limit                     | 利用限度額                           |
| investment                       | 投資                                 |
| gain                             | 評価損益                             |
| bank account                     | 銀行口座                             |
| cash                             | 現金                                 |
| primary currency                 | 基本通貨                             |
| display currency                 | 表示通貨                             |
| exchange rate                    | 為替レート                           |
| Overview                         | 概要                                 |
| Activity                         | 履歴                                 |
| Recurring                        | 定期                                 |
| recurring payment / subscription | 定期支払い / サブスク                |
| due                              | 期日                                 |
| auto-pay                         | 自動で記録                           |
| skip                             | スキップ                             |
| upcoming                         | 予定                                 |
| Add / quick add                  | 追加 / クイック入力                  |
| usual pace                       | いつものペース                       |
| projection                       | 見込み                               |
| rule / payee rule                | ルール / 取引先ルール                |
| attachment / receipt / payslip   | 添付ファイル / レシート / 給与明細   |
| archive                          | アーカイブ                           |
| Settings                         | 設定                                 |
| General                          | 一般                                 |
| Appearance                       | 外観                                 |
| Profile                          | プロフィール                         |
| Sign-in & security               | ログインとセキュリティ               |
| Import & export                  | インポートとエクスポート             |
| Delete & reset                   | 削除とリセット                       |
| API & MCP                        | API と MCP                           |
| passkey                          | パスキー                             |
| two-factor authentication        | 2段階認証                            |
| backup codes                     | バックアップコード                   |
| AI                               | AI                                   |
| provider                         | プロバイダ                           |
| What AI can see                  | AIに見せる情報                       |
| Auto-categorise                  | 自動カテゴリ分け                     |
| Natural-language add             | 文章で入力                           |
| Receipt scanning                 | レシート読み取り                     |
| Monthly recap                    | 月次まとめ                           |
| Ask Kosha / Ask                  | Koshaに質問 / 質問                   |
| hide amounts                     | 金額を隠す                           |
| Balance correction               | 残高修正                             |
| Reconciliation adjustment        | 照合調整                             |
| tick / ticked                    | チェックを付ける / チェック済み      |
| difference                       | 差額                                 |
| money in / money out             | 入金 / 出金                          |
| owed                             | 未払い残高 / 未払い                  |
| current account                  | 普通預金                             |
| market rate                      | 市場レート                           |
| fee                              | 手数料                               |
| Out / In / Net                   | 支出 / 収入 / 収支                   |
| bill                             | 請求                                 |
| Make recurring                   | 定期にする                           |
| Needs attention                  | 要対応                               |
| Coming up                        | 今後の予定                           |
| Default account                  | 既定の口座                           |
| Payee rules                      | 取引先ルール                         |
| Theme / Accent colour / Density  | テーマ / アクセントカラー / 表示密度 |
| Keyboard shortcuts               | キーボードショートカット             |
| API key                          | APIキー                              |
| Connected apps                   | 連携中のアプリ                       |
| Request log                      | リクエストログ                       |
| Use AI features                  | AI機能を使う                         |
| look-up                          | 参照                                 |
| endpoint                         | エンドポイント                       |
| Signed-in devices                | ログイン中のデバイス                 |
| authenticator app                | 認証アプリ                           |
| Delete account                   | アカウントを削除                     |
| privacy policy / terms           | プライバシーポリシー / 利用規約      |
| self-hosted copy                 | 自分専用のKosha（セルフホスト）      |
| Install / Reload                 | インストール / 再読み込み            |
| tagline                          | サッと記録、ちゃんと把握。           |

### 中文 (`zh`)

| English                          | 中文                 |
| -------------------------------- | -------------------- |
| Kosha                            | Kosha                |
| account                          | 账户                 |
| Kosha account / your account     | Kosha 账号           |
| sign in / sign out               | 登录 / 退出登录      |
| create an account / sign up      | 创建账号 / 注册      |
| demo account                     | 演示账号             |
| transaction / entry              | 交易                 |
| payee                            | 交易对象             |
| category                         | 分类                 |
| tag                              | 标签                 |
| event                            | 事件                 |
| expense / spending               | 支出                 |
| income                           | 收入                 |
| transfer                         | 转账                 |
| transfer fee                     | 转账手续费           |
| correction                       | 更正                 |
| opening balance                  | 期初余额             |
| balance                          | 余额                 |
| statement                        | 对账单               |
| statement balance                | 对账单余额           |
| reconcile / reconciliation       | 对账                 |
| reconciled                       | 已对账               |
| import                           | 导入                 |
| export                           | 导出                 |
| net worth                        | 净资产               |
| credit card                      | 信用卡               |
| available credit                 | 可用额度             |
| credit limit                     | 信用额度             |
| investment                       | 投资                 |
| gain                             | 收益                 |
| bank account                     | 银行账户             |
| cash                             | 现金                 |
| primary currency                 | 主货币               |
| display currency                 | 显示货币             |
| exchange rate                    | 汇率                 |
| Overview                         | 概览                 |
| Activity                         | 明细                 |
| Recurring                        | 定期                 |
| recurring payment / subscription | 定期付款 / 订阅      |
| due                              | 到期                 |
| auto-pay                         | 自动记账             |
| skip                             | 跳过                 |
| upcoming                         | 即将到期             |
| Add / quick add                  | 添加 / 快速添加      |
| usual pace                       | 往常节奏             |
| projection                       | 预计                 |
| rule / payee rule                | 规则 / 交易对象规则  |
| attachment / receipt / payslip   | 附件 / 收据 / 工资单 |
| archive                          | 归档                 |
| Settings                         | 设置                 |
| General                          | 通用                 |
| Appearance                       | 外观                 |
| Profile                          | 个人资料             |
| Sign-in & security               | 登录与安全           |
| Import & export                  | 导入与导出           |
| Delete & reset                   | 删除与重置           |
| API & MCP                        | API 与 MCP           |
| passkey                          | 通行密钥             |
| two-factor authentication        | 双重验证             |
| backup codes                     | 备用码               |
| AI                               | AI                   |
| provider                         | 服务商               |
| What AI can see                  | AI 可见内容          |
| Auto-categorise                  | 自动分类             |
| Natural-language add             | 自然语言添加         |
| Receipt scanning                 | 收据识别             |
| Monthly recap                    | 月度回顾             |
| Ask Kosha / Ask                  | 问问 Kosha / 提问    |
| hide amounts                     | 隐藏金额             |
| Balance correction               | 余额更正             |
| Reconciliation adjustment        | 对账调整             |
| tick / ticked                    | 勾选 / 已勾选        |
| difference                       | 差额                 |
| money in / money out             | 入账 / 出账          |
| owed                             | 欠款                 |
| current account                  | 活期账户             |
| market rate                      | 市场汇率             |
| fee                              | 手续费               |
| Out / In / Net                   | 支出 / 收入 / 净额   |
| bill                             | 账单                 |
| Make recurring                   | 设为定期             |
| Needs attention                  | 待处理               |
| Coming up                        | 即将到来             |
| Default account                  | 默认账户             |
| Payee rules                      | 交易对象规则         |
| Theme / Accent colour / Density  | 主题 / 强调色 / 密度 |
| Keyboard shortcuts               | 键盘快捷键           |
| API key                          | API 密钥             |
| Connected apps                   | 已连接的应用         |
| Request log                      | 请求日志             |
| Use AI features                  | 使用 AI 功能         |
| look-up                          | 查询                 |
| endpoint                         | 端点                 |
| Signed-in devices                | 已登录设备           |
| authenticator app                | 身份验证器应用       |
| Delete account                   | 删除 Kosha 账号      |
| privacy policy / terms           | 隐私政策 / 服务条款  |
| self-hosted copy                 | 自托管实例           |
| Install / Reload                 | 安装 / 重新加载      |
| tagline                          | 花了就记，心里有底。 |

### 한국어 (`ko`)

| English                          | 한국어                          |
| -------------------------------- | ------------------------------- |
| Kosha                            | Kosha                           |
| account                          | 계좌                            |
| Kosha account / your account     | Kosha 계정 / 내 계정            |
| sign in / sign out               | 로그인 / 로그아웃               |
| create an account / sign up      | 계정 만들기 / 가입하기          |
| demo account                     | 데모 계정                       |
| transaction / entry              | 거래                            |
| payee                            | 거래처                          |
| category                         | 카테고리                        |
| tag                              | 태그                            |
| event                            | 이벤트                          |
| expense / spending               | 지출                            |
| income                           | 수입                            |
| transfer                         | 이체                            |
| transfer fee                     | 이체 수수료                     |
| correction                       | 보정                            |
| opening balance                  | 시작 잔액                       |
| balance                          | 잔액                            |
| statement                        | 명세서                          |
| statement balance                | 명세서 잔액                     |
| reconcile / reconciliation       | 대조하다 / 대조                 |
| reconciled                       | 대조 완료                       |
| import                           | 가져오기                        |
| export                           | 내보내기                        |
| net worth                        | 순자산                          |
| credit card                      | 신용카드                        |
| available credit                 | 사용 가능 한도                  |
| credit limit                     | 신용 한도                       |
| investment                       | 투자                            |
| gain                             | 손익 (수익 / 손실)              |
| bank account                     | 은행 계좌                       |
| cash                             | 현금                            |
| primary currency                 | 기본 통화                       |
| display currency                 | 표시 통화                       |
| exchange rate                    | 환율                            |
| Overview                         | 개요                            |
| Activity                         | 내역                            |
| Recurring                        | 정기 거래                       |
| recurring payment / subscription | 정기 거래 / 구독                |
| due                              | 예정일 / 결제 예정              |
| auto-pay                         | 결제 자동 기록                  |
| skip                             | 건너뛰기                        |
| upcoming                         | 예정                            |
| Add / quick add                  | 추가 / 빠른 추가                |
| usual pace                       | 평소 수준                       |
| projection                       | 예상                            |
| rule / payee rule                | 규칙 / 거래처 규칙              |
| attachment / receipt / payslip   | 첨부 파일 / 영수증 / 급여명세서 |
| archive                          | 보관                            |
| Settings                         | 설정                            |
| General                          | 일반                            |
| Appearance                       | 화면                            |
| Profile                          | 프로필                          |
| Sign-in & security               | 로그인 및 보안                  |
| Import & export                  | 가져오기 및 내보내기            |
| Delete & reset                   | 삭제 및 초기화                  |
| API & MCP                        | API 및 MCP                      |
| passkey                          | 패스키                          |
| two-factor authentication        | 2단계 인증                      |
| backup codes                     | 백업 코드                       |
| AI                               | AI                              |
| provider                         | 제공업체                        |
| What AI can see                  | AI가 볼 수 있는 정보            |
| Auto-categorise                  | 자동 분류                       |
| Natural-language add             | 문장으로 추가                   |
| Receipt scanning                 | 영수증 스캔                     |
| Monthly recap                    | 월간 요약                       |
| Ask Kosha / Ask                  | Kosha에게 물어보기 / 질문       |
| hide amounts                     | 금액 숨기기                     |
| Balance correction               | 잔액 보정                       |
| Reconciliation adjustment        | 대조 조정                       |
| tick / ticked                    | 체크 / 체크됨                   |
| difference                       | 차액                            |
| money in / money out             | 입금 / 출금                     |
| owed                             | 미결제 금액 / 미결제            |
| current account                  | 입출금 계좌                     |
| market rate                      | 시장 환율                       |
| fee                              | 수수료                          |
| Out / In / Net                   | 지출 / 수입 / 순액              |
| bill                             | 고정비                          |
| Make recurring                   | 정기 거래로 만들기              |
| Needs attention                  | 확인 필요                       |
| Coming up                        | 예정                            |
| Default account                  | 기본 계좌                       |
| Payee rules                      | 거래처 규칙                     |
| Theme / Accent colour / Density  | 테마 / 강조 색상 / 밀도         |
| Keyboard shortcuts               | 키보드 단축키                   |
| API key                          | API 키                          |
| Connected apps                   | 연결된 앱                       |
| Request log                      | 요청 기록                       |
| Use AI features                  | AI 기능 사용                    |
| look-up                          | 조회                            |
| endpoint                         | 엔드포인트                      |
| Signed-in devices                | 로그인된 기기                   |
| authenticator app                | 인증 앱                         |
| Delete account                   | 계정 삭제                       |
| privacy policy / terms           | 개인정보 처리방침 / 이용약관    |
| self-hosted copy                 | 직접 운영하는 Kosha             |
| Install / Reload                 | 설치 / 새로고침                 |
| tagline                          | 쓴 만큼 적고, 간 곳은 알고.     |

### हिन्दी (`hi`)

| English                          | हिन्दी                                           |
| -------------------------------- | ----------------------------------------------- |
| Kosha                            | Kosha                                           |
| account                          | खाता (बहुवचन खाते)                                |
| Kosha account / your account     | Kosha अकाउंट / आपका अकाउंट                        |
| sign in / sign out               | साइन इन / साइन आउट                              |
| create an account / sign up      | अकाउंट बनाएँ / साइन अप                            |
| demo account                     | डेमो अकाउंट                                       |
| transaction / entry              | लेन-देन / एंट्री                                    |
| payee                            | पार्टी                                           |
| category                         | श्रेणी                                            |
| tag                              | टैग                                              |
| event                            | इवेंट                                             |
| expense / spending               | खर्च                                             |
| income                           | आय                                              |
| transfer                         | ट्रांसफ़र                                          |
| transfer fee                     | ट्रांसफ़र शुल्क                                      |
| correction                       | सुधार                                            |
| opening balance                  | शुरुआती बैलेंस                                       |
| balance                          | बैलेंस                                             |
| statement                        | स्टेटमेंट                                           |
| statement balance                | स्टेटमेंट बैलेंस                                       |
| reconcile / reconciliation       | मिलान करें / मिलान                                |
| reconciled                       | मिलान हो चुका                                    |
| import                           | इम्पोर्ट                                          |
| export                           | एक्सपोर्ट                                         |
| net worth                        | नेट वर्थ                                          |
| credit card                      | क्रेडिट कार्ड                                      |
| available credit                 | उपलब्ध क्रेडिट                                     |
| credit limit                     | क्रेडिट लिमिट                                     |
| investment                       | निवेश                                            |
| gain                             | रिटर्न                                           |
| bank account                     | बैंक खाता                                         |
| cash                             | नकद                                             |
| primary currency                 | मुख्य मुद्रा                                        |
| display currency                 | डिस्प्ले मुद्रा                                      |
| exchange rate                    | एक्सचेंज रेट                                        |
| Overview                         | ओवरव्यू                                           |
| Activity                         | गतिविधि                                         |
| Recurring                        | नियमित                                          |
| recurring payment / subscription | नियमित भुगतान / सब्सक्रिप्शन                        |
| due                              | देय                                              |
| auto-pay                         | भुगतान अपने-आप दर्ज करें                             |
| skip                             | छोड़ें                                             |
| upcoming                         | आने वाले                                          |
| Add / quick add                  | जोड़ें / झटपट जोड़ें                                  |
| usual pace                       | सामान्य रफ़्तार                                    |
| projection                       | अनुमान                                           |
| rule / payee rule                | नियम / पार्टी नियम                               |
| attachment / receipt / payslip   | अटैचमेंट / रसीद / सैलरी स्लिप                        |
| archive                          | आर्काइव करें                                       |
| Settings                         | सेटिंग्स                                           |
| General                          | सामान्य                                          |
| Appearance                       | रूप-रंग                                           |
| Profile                          | प्रोफ़ाइल                                         |
| Sign-in & security               | साइन-इन और सुरक्षा                                |
| Import & export                  | इम्पोर्ट और एक्सपोर्ट                               |
| Delete & reset                   | हटाएँ और रीसेट                                    |
| API & MCP                        | API और MCP                                      |
| passkey                          | पासकी                                           |
| two-factor authentication        | टू-फ़ैक्टर ऑथेंटिकेशन                                  |
| backup codes                     | बैकअप कोड                                        |
| AI                               | AI                                              |
| provider                         | प्रोवाइडर                                        |
| What AI can see                  | AI क्या देख सकता है                                |
| Auto-categorise                  | अपने-आप श्रेणी चुनना                                |
| Natural-language add             | अपने शब्दों में जोड़ना                                |
| Receipt scanning                 | रसीद स्कैन करना                                   |
| Monthly recap                    | मासिक सारांश                                     |
| Ask Kosha / Ask                  | Kosha से पूछें / पूछें                                 |
| hide amounts                     | रकम छिपाएँ                                       |
| Balance correction               | बैलेंस सुधार                                        |
| Reconciliation adjustment        | मिलान समायोजन                                   |
| tick / ticked                    | टिक करें / टिक किया                               |
| difference                       | अंतर                                             |
| money in / money out             | जमा / निकासी                                    |
| owed                             | बकाया                                           |
| current account                  | चालू खाता                                        |
| market rate                      | बाज़ार दर                                        |
| fee                              | शुल्क                                             |
| Out / In / Net                   | निकासी / जमा / नेट                               |
| bill                             | बिल                                             |
| Make recurring                   | नियमित बनाएँ                                     |
| Needs attention                  | ध्यान दें                                          |
| Coming up                        | जल्द आने वाले                                      |
| Default account                  | डिफ़ॉल्ट खाता                                     |
| Payee rules                      | पार्टी नियम                                      |
| Theme / Accent colour / Density  | थीम / एक्सेंट रंग / सघनता                           |
| Keyboard shortcuts               | कीबोर्ड शॉर्टकट                                   |
| API key                          | API कुंजी                                         |
| Connected apps                   | जुड़े हुए ऐप                                        |
| Request log                      | रिक्वेस्ट लॉग                                      |
| Use AI features                  | AI फ़ीचर इस्तेमाल करें                               |
| look-up                          | खोज                                             |
| endpoint                         | एंडपॉइंट                                          |
| Signed-in devices                | साइन-इन वाले डिवाइस                              |
| authenticator app                | ऑथेंटिकेटर ऐप                                      |
| Delete account                   | अकाउंट हटाएँ                                      |
| privacy policy / terms           | गोपनीयता नीति / सेवा की शर्तें                      |
| self-hosted copy                 | अपनी कॉपी                                       |
| Install / Reload                 | इंस्टॉल करें / फिर से लोड करें                         |
| tagline                          | जो खर्च किया, लिख लीजिए। पैसा कहाँ गया, जान लीजिए। |
