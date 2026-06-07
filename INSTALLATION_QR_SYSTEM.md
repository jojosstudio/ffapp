# 🎫 QR-Code Einladungssystem - Installation & Deployment

## Installation

### 1. npm-Pakete installieren

Das System benötigt das `qrcode` npm-Paket für die QR-Code-Generierung:

```bash
npm install qrcode
```

Oder aktualisieren Sie `package.json`:
```bash
npm install
```

### 2. Datenbank aktualisieren

Überprüfen Sie, ob die `invitations` Tabelle in der Datenbank existiert:

```sql
CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL,
    email TEXT,
    token TEXT NOT NULL UNIQUE,
    role TEXT CHECK(role IN ('zugfuehrer', 'ff', 'jf')) DEFAULT 'ff',
    used BOOLEAN DEFAULT FALSE,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected', 'revoked')) DEFAULT 'pending',
    responded_at DATETIME,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

Diese Tabelle wird automatisch erstellt, wenn sie nicht existiert.

### 3. Anwendung starten

```bash
npm start
# oder für Entwicklung:
npm run dev
```

Die Anwendung läuft dann auf `http://localhost:3000`

---

## Neue Dateien

### Model
- **`models/Invitation.js`** - Invitation-Management-Klasse

### Routes
- **Routes in `routes/auth.js`** erweitert:
  - `GET /auth/register-with-invitation/:token` - Registrierungsformular
  - `POST /auth/register-with-invitation/:token` - Registrierung abschließen

- **Routes in `routes/admin.js`** hinzugefügt:
  - `GET /admin/invitations` - Einladungsverwaltung
  - `POST /admin/invitations/create` - Neue Einladungen erstellen
  - `GET /admin/invitations/qr/:token` - QR-Code anzeigen
  - `POST /admin/invitations/revoke/:token` - Einladung widerrufen

### Views
- **`views/auth/register-with-invitation.ejs`** - Registrierungsformular für Einladungen
- **`views/admin/invitations.ejs`** - Verwaltungsinterface für Einladungen
- **`views/admin/invitation-qr.ejs`** - QR-Code-Anzeigenseite

### Aktualisierte Views
- **`views/admin/station-dashboard.ejs`** - Link zum QR-Code-System hinzugefügt

---

## Konfiguration

### Umgebungsvariablen (.env)

Optionale Konfigurationen:

```env
# Basis-URL für QR-Codes (für vollständige Links)
BASE_URL=https://deine-domain.de

# Standard-QR-Ablaufdauer in Tagen
QR_EXPIRY_DAYS=30
```

### QR-Code-Qualität anpassen

In `routes/admin.js` können Sie die QR-Code-Größe anpassen:

```javascript
// QR-Code mit Optionen generieren
const qrCodeDataUrl = await QRCode.toDataURL(invitationUrl, {
    width: 300,           // Breite in Pixeln
    margin: 2,            // Rand in Modulen
    color: {
        dark: '#000000',  // Farbe der QR-Code-Module
        light: '#FFFFFF'  // Hintergrundfarbe
    }
});
```

---

## Sicherheitsüberlegungen

### ✅ Implementiert

1. **Token-Sicherheit**: 32 Bytes (64 Zeichen) hex-codierter Token
2. **Ablaufschutz**: Tokens verfallen nach 30 Tagen
3. **Stationsgebundenheit**: QR-Codes können nur vom ursprünglichen Löschzug verwendet werden
4. **CSRF-Schutz**: Express eingebaut (nicht explizit benötigt für POST)
5. **Zugriffsschutz**: Nur Zugführer/Admin können Einladungen erstellen und verwalten

### ⚠️ Zu beachten

1. **HTTPS in Production**: Stellen Sie sicher, dass die App über HTTPS läuft
2. **Session-Sicherheit**: SESSION_SECRET in .env setzen
3. **Rate Limiting**: Erwägen Sie Rate-Limiting für `/admin/invitations/create`
4. **Audit Logging**: Überprüfen Sie ggf. das Logging von Einladungserstellungen

---

## Testing

### Manuelles Testen

1. **Als Zugführer anmelden** und zu `/admin/invitations` navigieren
2. **Neue Einladung erstellen** (z.B. 3 Stück für FF)
3. **QR-Code anzeigen** und URL kopieren
4. **In privatem Fenster** die URL öffnen
5. **Registrierungsformular ausfüllen** mit neuen Daten
6. **Anmelden** mit dem neuen Account
7. **Bestätigen**, dass die Rolle korrekt zugewiesen wurde

### Test-Szenarien

```
Szenario 1: Normaler QR-Code-Flow
- QR-Code erstellen ✓
- Registrieren mit Token ✓
- Anmelden ✓
- Token kann erneut verwendet werden ✓

Szenario 2: Abgelaufener QR-Code
- 30 Tage warten (oder manuell DB ändern)
- Versuchen zu registrieren
- Fehler: "Ungültiger oder abgelaufener Link" ✓

Szenario 3: Widerrufener QR-Code
- QR-Code widerrufen
- Versuchen zu registrieren
- Fehler: "Ungültiger oder abgelaufener Link" ✓

Szenario 4: Duplikat-Nutzer
- Mit demselben Nickname registrieren
- Fehler: "Dieser Nickname ist bereits vergeben" ✓
```

---

## Troubleshooting

### Problem: "Cannot find module 'qrcode'"

**Lösung:**
```bash
npm install qrcode
```

### Problem: QR-Code wird nicht angezeigt

**Mögliche Ursachen:**
1. qrcode Modul nicht installiert
2. NODE_ENV nicht korrekt gesetzt
3. Browser-Kompatibilität (versuchen Sie einen anderen Browser)

**Lösung:**
```bash
# Module neu installieren
npm install

# Server neu starten
npm start
```

### Problem: Invitations-Tabelle existiert nicht

**Lösung:**
Die Tabelle wird automatisch beim ersten Start erstellt. Wenn nicht:
1. Datenbank-Dateien löschen (nur für Development!)
2. `npm run db:init` ausführen oder
3. Manuell SQL ausführen (siehe Installationsanleitung)

### Problem: Registrierung schlägt fehl mit "Authentifizierungsfehler"

**Ursache:** Wahrscheinlich wird der Benutzername als `active=false` gespeichert  
**Lösung:** Überprüfen Sie die `User.create()` Methode in `models/User.js`

---

## Performance-Optimierungen

### Für große Instanzen

1. **Indexe hinzufügen**:
```sql
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_station ON invitations(station_id);
CREATE INDEX idx_invitations_expires ON invitations(expires_at);
```

2. **Einladungen archivieren**: Nach 90 Tagen alte Einladungen löschen

3. **QR-Codes cachen**: Einmal generierte QR-Codes zwischenlagern

---

## Backup & Wiederherstellung

Die Invitations-Tabelle sollte in regelmäßige Backups einbezogen sein:

```bash
# SQLite Backup
sqlite3 database.db ".dump invitations" > invitations_backup.sql
```

---

## Versionsverlauf

**v1.0 (Juni 2026)**
- ✨ Initial Release
- 🎫 QR-Code Einladungssystem
- 📋 Admin-Interface
- 📱 Mobile-freundliche Registrierung

---

## Support

Bei Fragen oder Problemen:
1. Überprüfen Sie die Dokumentation (`QR_EINLADUNGSSYSTEM.md`)
2. Prüfen Sie die Server-Logs
3. Kontaktieren Sie den System-Administrator
