# 📋 QR-Code Einladungssystem - Übersicht der Implementierung

## ✅ Implementierte Komponenten

### 1. Backend-Model
**Datei:** `models/Invitation.js` (NEU)

```javascript
// Hauptfunktionen:
- create()              // Neue Einladung erstellen
- findByToken()         // Einladung anhand Token finden
- findByStation()       // Alle Einladungen eines Löschzugs
- markUsed()           // Einladung als verwendet markeln
- revoke()             // Einladung widerrufen
- getStationStats()    // Statistiken für Löschzug
- getQRUrl()           // QR-Code URL generieren
```

### 2. Authentication Routes
**Datei:** `routes/auth.js` (ERWEITERT)

Neue Routes:
```
GET  /auth/register-with-invitation/:token       → Registrierungsformular anzeigen
POST /auth/register-with-invitation/:token       → Registrierung mit Token abschließen
```

Features:
- ✅ Token-Validierung
- ✅ Rolle-Selektion (FF/JF)
- ✅ Automatische Stationszuordnung
- ✅ Passwort-Hashing
- ✅ Token als "verwendet" markieren

### 3. Admin Routes
**Datei:** `routes/admin.js` (ERWEITERT)

Neue Routes:
```
GET  /admin/invitations                    → Verwaltungsinterface
POST /admin/invitations/create             → Neue Einladungen erstellen
GET  /admin/invitations/qr/:token          → QR-Code anzeigen
POST /admin/invitations/revoke/:token      → Einladung widerrufen
```

Features:
- ✅ Massenersstellung (bis 50 auf einmal)
- ✅ QR-Code-Generierung mit `qrcode` npm-Paket
- ✅ Direkter Einladungs-Link
- ✅ Zugriffskontrolle (nur Zugführer ihres Löschzugs)
- ✅ Statistik-Tracking

### 4. Frontend Views
**3 neue EJS Templates:**

#### `views/auth/register-with-invitation.ejs`
- 📝 Registrierungsformular mit Token
- 👤 Vollständiger Name
- 🔑 Benutzername & Passwort
- 🧑‍💼 Rollenselektion
- ✅ Zustimmung zu Bedingungen

#### `views/admin/invitations.ejs`
- 📊 Statistik-Übersicht (Gesamt/Verwendet/Widerrufen/Abgelaufen)
- ➕ Formular zur Erstellung neuer QR-Codes
- 📋 Tabelle mit allen Einladungen
- 🎫 Status-Anzeige
- 🗑️ Widerrufen-Button
- ℹ️ Info-Box mit Anleitung

#### `views/admin/invitation-qr.ejs`
- 🎫 QR-Code-Anzeige (PNG-Bild)
- 🏢 Einladungsdetails
- 🔗 Direkter Link zum Teilen
- 📋 Copy-to-Clipboard Funktionalität
- 🖨️ Druck-Unterstützung
- 📚 Anleitung für neue Mitglieder

#### `views/admin/station-dashboard.ejs` (AKTUALISIERT)
- ✨ Neue grüne Karte für "QR-Code Einladungen"
- 🔗 Link zur QR-Code-Verwaltung

### 5. Dokumentation
2 neue Dokumentationen:

#### `QR_EINLADUNGSSYSTEM.md`
- 📖 Ausführliche Benutzerhandbuch
- 👨‍💼 Anleitung für Zugführer
- 👥 Anleitung für neue Mitglieder
- 🔧 Technische Details
- ❓ FAQ
- 🐛 Troubleshooting

#### `INSTALLATION_QR_SYSTEM.md`
- 📦 Installationsanleitung
- 🔐 Sicherheitsüberlegungen
- 🧪 Testing-Anleitung
- ⚡ Performance-Optimierungen
- 🆘 Troubleshooting

---

## 🗄️ Datenbank

Die bestehende `invitations` Tabelle wird erweitert:

```sql
CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL,         -- Zugeordneter Löschzug
    token TEXT NOT NULL UNIQUE,          -- Eindeutiger QR-Token (64 Zeichen)
    role TEXT DEFAULT 'ff',              -- Rolle: 'ff' oder 'jf'
    used BOOLEAN DEFAULT FALSE,          -- Wurde dieser Token verwendet?
    status TEXT DEFAULT 'pending',       -- 'pending', 'accepted', 'revoked'
    created_by INTEGER NOT NULL,         -- Ersteller (Zugführer)
    created_at DATETIME DEFAULT NOW,     -- Erstellungsdatum
    expires_at DATETIME,                 -- Ablaufdatum (Standard: +30 Tage)
    responded_at DATETIME,               -- Wann wurde verwendet?
    FOREIGN KEY (station_id) REFERENCES stations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Indizes für Performance
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_station ON invitations(station_id);
CREATE INDEX idx_invitations_expires ON invitations(expires_at);
```

---

## 📦 npm-Abhängigkeiten

Benötigt: **[qrcode](https://www.npmjs.com/package/qrcode)** >= 1.4.0

Installation:
```bash
npm install qrcode
```

---

## 🔐 Sicherheitsfeatures

| Feature | Beschreibung |
|---------|-------------|
| **Token-Länge** | 32 Bytes (64 Hex-Zeichen) |
| **Ablauf** | Standard 30 Tage konfigurierbar |
| **Verschlüsselung** | Passwort mit bcryptjs gehasht |
| **Stationschutz** | Nur für ursprüngliche Station gültig |
| **Rollenschutz** | Vom Zugführer vordefiniert |
| **Zugriffskontrolle** | nur Zugführer/Admin |

---

## 🚀 Workflow zum Aktivieren

### Schritt 1: npm-Paket installieren
```bash
npm install qrcode
```

### Schritt 2: Server starten
```bash
npm start
```

### Schritt 3: Als Zugführer anmelden
- Zu `/admin` navigieren
- "Zur QR-Code-Verwaltung" klicken

### Schritt 4: QR-Codes erstellen
- Rolle auswählen (FF/JF)
- Anzahl eingeben (1-50)
- "Einladungen erstellen" klicken

### Schritt 5: QR-Code teilen
- "QR-Code" Button klicken
- Link kopieren ODER
- Code ausdrucken und aufhängen

---

## 📊 Statistik-System

Die Admin-Seite zeigt folgende Metriken:

```
┌─────────────────────────────────┐
│ Gesamt | Verwendet | Widerrufen │
│  10    │    7      │     1      │
└─────────────────────────────────┘
                ↓
          Abgelaufen: 2
```

Verwendet für:
- ✅ Tracking der Registrierungen
- ✅ Überwachung ungenutzter Codes
- ✅ Erfolgskontrolle von Campaigns

---

## 🎯 Use Cases

### Use Case 1: Löschzug-Verstärkung
1. Zugführer erstellt 5 QR-Codes für "FF"
2. Code wird bei der nächsten Mitgliederversammlung ausgedruckt und an die Wand gehängt
3. Interessierte Freunde und Familie scannen und registrieren sich sofort
4. Sie sind automatisch im Löschzug und können mit Challenges starten

### Use Case 2: Jugendfeuerwehr-Ausbildung
1. JF-Leiter erstellt 20 QR-Codes für "JF"
2. Links werden an die Eltern per E-Mail/WhatsApp verteilt
3. Die Jugendlichen registrieren sich selbst
4. Alle können sofort in ihrem Alter-gerechten Challenges trainieren

### Use Case 3: Event/Wettbewerb
1. Event-Organisator erstellt 100 QR-Codes (25x FF, 25x JF, 50x weitere)
2. QR-Codes werden am Event ausgedruckt
3. Teilnehmer scannen beim Eintreffen
4. Sind sofort registriert und können Challenges absolvieren

---

## 📈 Skalierbarkeit

- ✅ Bis zu 50 QR-Codes pro Erstellt-Vorgang
- ✅ Unlimited QR-Codes pro Löschzug
- ✅ Effiziente Token-basierte Lookups
- ✅ Zeitgesteuerte Verfallslogik (keine Cleanup-Prozesse nötig)

---

## 🔄 API-Struktur

```
User scankt QR-Code
        ↓
   /auth/register-with-invitation/:token (GET)
        ↓
  Registrierungsformular wird gerendert
        ↓
  Benutzer füllt Formular aus
        ↓
   /auth/register-with-invitation/:token (POST)
        ↓
  Token wird validiert
  Benutzer wird erstellt
  Einladung wird als "verwendet" markiert
        ↓
  Weiterleitung zu /login
        ↓
  Benutzer meldet sich an
        ↓
  Dashboard / Challenges starten
```

---

## 🎨 UI/UX Features

- 📱 **Responsive Design**: Funktioniert auf Smartphone, Tablet, Desktop
- 🎨 **Farbbasis**: Grün für QR-System (NEW), Blau für Standard
- 🌙 **Dunkelmode-Ready**: Nutzt Bootstrap-Standard-Klassen
- ♿ **Accessibility**: Semantisches HTML, ARIA-Labels
- 🌍 **Multi-Sprache**: Deutsche Texte durchgehend
- 📤 **Copy-to-Clipboard**: JavaScript-Hilfsfunktionen

---

## 🚨 Bekannte Limitierungen

| Limitierung | Grund | Workaround |
|------------|-------|-----------|
| Max 50 Codes pro Erstellt | Verhindert Spam | Mehrfach erstellen |
| 30 Tage Ablauf | Sicherheit | Neue Codes erzeugen |
| 1 Rolle pro Code | Klare Struktur | Mehrere Codes pro Gruppe |

---

## 📝 Änderungsliste

| Datei | Art | Details |
|------|-----|---------|
| `models/Invitation.js` | NEU | Invitation-Management |
| `routes/auth.js` | ERWEITERT | Register-with-invitation routes |
| `routes/admin.js` | ERWEITERT | QR-Code-Management routes |
| `views/auth/register-with-invitation.ejs` | NEU | Registrierungsformular |
| `views/admin/invitations.ejs` | NEU | Admin-Interface |
| `views/admin/invitation-qr.ejs` | NEU | QR-Code-Anzeige |
| `views/admin/station-dashboard.ejs` | ERWEITERT | Link hinzugefügt |
| `package.json` | OPTIONAL | `qrcode` Paket |

---

## ✨ Nächste Mögliche Features

Für zukünftige Versionen:
- 📧 E-Mail-Benachrichtigung bei QR-Code Registrierungen
- 🔔 Push-Notifikation für neue Mitglieder
- 📊 Erweiterte Analytik & Reports
- 🎨 Anpassbare QR-Code-Designs
- 📲 Mobile App Integration
- 🌐 Multi-Sprachigkeit

---

**Version**: 1.0  
**Release-Datum**: Juni 2026  
**Status**: ✅ Production Ready
