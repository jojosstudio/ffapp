const webPush = require('web-push');
const { query, run } = require('./db');

// VAPID-Keys konfigurieren
webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@feuerwehr-challenge.de',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

class PushService {

    // Datenbank-Tabelle initialisieren
    static async initTable() {
        await run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, endpoint)
        )`);
        await run(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)`);
    }

    // Subscription speichern
    static async subscribe(userId, subscription) {
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            throw new Error('Ungültige Subscription-Daten');
        }
        await run(
            `INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) 
             VALUES (?, ?, ?, ?)`,
            [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
        );
    }

    // Subscription entfernen
    static async unsubscribe(userId, endpoint) {
        await run(
            `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`,
            [userId, endpoint]
        );
    }

    // Alle Subscriptions eines Benutzers abrufen
    static async getUserSubscriptions(userId) {
        return await query(
            `SELECT * FROM push_subscriptions WHERE user_id = ?`,
            [userId]
        );
    }

    // Alle Subscriptions abrufen
    static async getAllSubscriptions() {
        return await query(`SELECT * FROM push_subscriptions`);
    }

    // Subscriptions aller Benutzer einer Station abrufen
    static async getStationSubscriptions(stationId) {
        return await query(
            `SELECT ps.* FROM push_subscriptions ps
             JOIN users u ON ps.user_id = u.id
             WHERE u.station_id = ?`,
            [stationId]
        );
    }

    // Push-Benachrichtigung an eine einzelne Subscription senden
    static async sendToSubscription(subscription, title, body, url = '/') {
        try {
            const pushSubscription = {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.p256dh,
                    auth: subscription.auth
                }
            };
            
            const payload = JSON.stringify({ title, body, url });
            
            await webPush.sendNotification(pushSubscription, payload, {
                TTL: 86400 // 24 Stunden
            });
            return true;
        } catch (error) {
            // Subscription ist ungültig/abgelaufen -> löschen
            if (error.statusCode === 410 || error.statusCode === 404) {
                await run(
                    `DELETE FROM push_subscriptions WHERE endpoint = ?`,
                    [subscription.endpoint]
                );
            }
            console.error('Push-Fehler:', error.message);
            return false;
        }
    }

    // Push an alle Benutzer senden
    static async sendToAll(title, body, url = '/') {
        const subscriptions = await this.getAllSubscriptions();
        let successCount = 0;
        let failCount = 0;

        for (const sub of subscriptions) {
            const success = await this.sendToSubscription(sub, title, body, url);
            if (success) successCount++;
            else failCount++;
        }

        return { successCount, failCount, total: subscriptions.length };
    }

    // Push an bestimmte Benutzer-IDs senden
    static async sendToUsers(userIds, title, body, url = '/') {
        if (!userIds || userIds.length === 0) return { successCount: 0, failCount: 0, total: 0 };

        const placeholders = userIds.map(() => '?').join(',');
        const subscriptions = await query(
            `SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`,
            userIds
        );

        let successCount = 0;
        let failCount = 0;

        for (const sub of subscriptions) {
            const success = await this.sendToSubscription(sub, title, body, url);
            if (success) successCount++;
            else failCount++;
        }

        return { successCount, failCount, total: subscriptions.length };
    }

    // Push an eine Station senden
    static async sendToStation(stationId, title, body, url = '/') {
        const subscriptions = await this.getStationSubscriptions(stationId);
        let successCount = 0;
        let failCount = 0;

        for (const sub of subscriptions) {
            const success = await this.sendToSubscription(sub, title, body, url);
            if (success) successCount++;
            else failCount++;
        }

        return { successCount, failCount, total: subscriptions.length };
    }
}

module.exports = PushService;