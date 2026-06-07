# 🎫 QR-Code Einladungssystem - Dokumentation

## Übersicht

Das neue QR-Code Einladungssystem ermöglicht es Zugführern, mehrere Personen gleichzeitig einzuladen, ohne diese einzeln manuell registrieren zu müssen. Jede Person kann einen gemeinsamen QR-Code scannen und sich selbst mit ihrer bevorzugten Rolle registrieren.

## Features

✅ **Massenregistrierung**: Ein QR-Code kann von mehreren Personen gescannt werden  
✅ **Rollenselektion**: Jeder wählt seine Rolle (FF oder JF) selbst  
✅ **Zeitliche Validität**: QR-Codes gelten für 30 Tage  
✅ **QR-Code Management**: Einsehen, Widerrufen und Neuerstellen möglich  
✅ **Sicherheit**: Token-basiertes System mit Einmal-Validierung pro Code  
✅ **Statistiken**: Tracking von verwendeten, widerrufenen und abgelaufenen Codes  

---

## Für Zugführer: Schritt-für-Schritt Anleitung

### 1. QR-Code-Verwaltung öffnen
- In der Löschzug-Verwaltung (`/admin`) auf **"Zur QR-Code-Verwaltung"** klicken
- Oder direkt zu `/admin/invitations` navigieren

### 2. Neue QR-Codes erstellen

**Schritte:**
1. Im Bereich "Neue Einladungen erstellen" die **Rolle** wählen:
   - 🧑‍🚒 **Feuerwehrleute (FF)** – für aktive Einsatzkräfte
   - 👨‍💼 **Jugendfeuerwehr (JF)** – für die Jugendabteilung
2. **Anzahl** eingeben (1-50 auf einmal)
3. Auf **"Einladungen erstellen"** klicken

### 3. QR-Code anzeigen & teilen

Nach der Erstellung erscheint die Einladung in der Tabelle:
- **"QR-Code"** Button klicken, um den Code anzuzeigen
- Den Code kann man:
  - 📱 **Ausdrucken** und beim Löschzug aufhängen
  - 📸 **Fotografieren** und per WhatsApp/E-Mail teilen
  - 💻 **Direkten Link kopieren** und digital versenden

### 4. Einladungen verwalten

In der Tabelle können Sie:
- ✅ **Status sehen**: Ausstehend / Verwendet / Widerrufen / Abgelaufen
- 🗑️ **Widerrufen**: QR-Code deaktivieren (nur aktive Codes)
- 📊 **Statistiken** oben sehen (Gesamt / Verwendet / Widerrufen / Abgelaufen)

---

## Für neue Mitglieder: Registrierungsprozess

### 1. QR-Code scannen oder Link öffnen
- Mit dem Smartphone den QR-Code scannen, **ODER**
- Den erhaltenen Link direkt öffnen: `https://deine-url.de/auth/register-with-invitation/TOKEN`

### 2. Registrierungsformular ausfüllen

Folgende Informationen werden benötigt:
- **Vollständiger Name**: z.B. "Max Mustermann"
- **Benutzername**: z.B. "max_mustermann" (keine Leerzeichen)
- **E-Mail**: Zur Kontaktaufnahme und Passwort-Reset
- **Passwort**: Mindestens 6 Zeichen (Groß- und Kleinschreibung empfohlen)
- **Passwort wiederholen**: Bestätigung eingeben
- **Rolle bestätigen**: Die vorgegebene Rolle oder selbst wählen
- **Bedingungen akzeptieren**: Häkchen setzen

### 3. Registrierung abschließen
- **"Registrieren"** Button klicken
- Erfolgsbestätigung erhalten
- Zur Anmeldungsseite (`/login`) weitergeleitet
- Mit Benutzername/E-Mail und Passwort anmelden

### 4. Im Löschzug aktiv werden
Nach dem Login kann der neue Nutzer sofort:
- 📋 Challenges bearbeiten
- 🏆 Punkte sammeln
- 🏅 Im Ranking aufsteigen
- 💬 Mit anderen Mitgliedern interagieren

---

## Technische Details

### Datenbankmodell

```sql
CREATE TABLE invitations (
    id INTEGER PRIMARY KEY,
    station_id INTEGER,          -- Der Löschzug
    token TEXT UNIQUE,           -- Eindeutiger Token für den QR-Code
    role TEXT,                   -- 'ff' oder 'jf'
    used BOOLEAN,                -- Ob bereits verwendet
    status TEXT,                 -- 'pending', 'accepted', 'revoked'
    created_by INTEGER,          -- Zugführer, der ihn erstellt hat
    created_at DATETIME,         -- Erstellungsdatum
    expires_at DATETIME,         -- Ablaufdatum (default: +30 Tage)
    responded_at DATETIME        -- Wann wurde er verwendet
);
```

### Sicherheitsmerkmale

1. **Token-Validierung**: Jeder QR-Code hat einen eindeutigen 64-stelligen Token
2. **Ablaufdatum**: QR-Codes sind nach 30 Tagen ungültig
3. **Einmal-Nutzung möglich**: Token kann mehrfach genutzt werden, bis er widerrufen wird
4. **Stationsgebunden**: Codes können nur für den jeweiligen Löschzug verwendet werden
5. **Rollenschutz**: Die Rolle wird vom Ersteller definiert oder vom Benutzer ausgewählt

### API Endpoints

```javascript
// GET - QR-Code-Verwaltung anzeigen
GET /admin/invitations

// POST - Neue Einladungen erstellen
POST /admin/invitations/create
Body: { role: 'ff|jf', quantity: number }

// GET - QR-Code und Link anzeigen
GET /admin/invitations/qr/:token

// POST - Einladung widerrufen
POST /admin/invitations/revoke/:token

// GET - Registrierungsformular mit Token
GET /auth/register-with-invitation/:token

// POST - Registrierung abschließen
POST /auth/register-with-invitation/:token
Body: { realname, nickname, email, password, password_confirm, role }
```

---

## Best Practices

### ✅ Empfohlen

- **Mehrere Codes mit unterschiedlichen Rollen** erstellen, wenn beide Gruppen (FF + JF) eingeladen werden
- **Kleine Anzahlen** statt Massenmengen (10-20 auf einmal)
- **Regelmäßige Überprüfung** der Statistiken
- **Ungenutzte Codes widerrufen** nach Event-Ende
- **QR-Code ausdrucken** und beim Treffen gut sichtbar aufhängen

### ❌ Nicht empfohlen

- 50 Codes auf einmal erstellen und dann nicht kontrollieren
- Codes mit unbegrenzter Gültigkeit (Standardmäßig 30 Tage – optimal)
- Persönliche Tokens weitergeben oder teilen
- Codes nach Ende der Aktion nicht widerrufen

---

## Fehlerbehebung

### Problem: "Ungültiger oder abgelaufener Einladungslink"

**Ursache**: Der Token ist abgelaufen oder wurde widerrufen  
**Lösung**: Zugführer sollte einen neuen QR-Code erstellen

### Problem: "Dieser Nickname ist bereits vergeben"

**Ursache**: Der Benutzername existiert bereits  
**Lösung**: Einen anderen Benutzernamen wählen

### Problem: "Diese E-Mail ist bereits registriert"

**Ursache**: Die E-Mail-Adresse ist bereits im System  
**Lösung**: Eine andere E-Mail verwenden oder Passwort zurücksetzen

### Problem: Statistische Daten zeigen nicht korrekt

**Lösung**: Seite mit F5 neu laden, der Cache wird geleert

---

## Häufig gestellte Fragen

**F: Wie lange ist ein QR-Code gültig?**  
A: 30 Tage nach Erstellung. Das Ablaufdatum wird angezeigt.

**F: Kann ein QR-Code mehrfach verwendet werden?**  
A: Ja! Der Code bleibt gültig, bis der Zugführer ihn widerruft oder er abläuft.

**F: Was ist mit dem Passwort?**  
A: Jede Person setzt ihr eigenes Passwort bei der Registrierung.

**F: Kann ich einen Code nachträglich widerrufen?**  
A: Ja, über die Einladungsverwaltung können aktive Codes widerrufen werden.

**F: Werden die Personen automatisch nach der Registrierung bestätigt?**  
A: Ja! Sie sind sofort aktiv und können mit ihren Challenges beginnen.

---

## Support & Feedback

Bei Problemen oder Verbesserungsvorschlägen kontaktieren Sie bitte die Plattform-Administratoren.

**Version**: 1.0 (Juni 2026)  
**Letzte Aktualisierung**: 2026-06-07
