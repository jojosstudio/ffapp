const { query, run, get } = require('./db');
const crypto = require('crypto');

class Invitation {
    // Create a new invitation token
    static async create(stationId, role = 'ff', createdBy) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 Tage gültig

        try {
            const result = await run(
                `INSERT INTO invitations (station_id, token, role, created_by, expires_at, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [stationId, token, role, createdBy, expiresAt.toISOString()]
            );
            return { id: result.lastID, token, stationId, role };
        } catch (error) {
            console.error('Error creating invitation:', error);
            throw error;
        }
    }

    // Find invitation by token
    static async findByToken(token) {
        return await get(
            `SELECT i.*, s.name as station_name, s.lz_number, c.name as city_name
             FROM invitations i
             LEFT JOIN stations s ON i.station_id = s.id
             LEFT JOIN cities c ON s.city_id = c.id
             WHERE i.token = ? AND i.status = 'pending' AND (i.expires_at IS NULL OR i.expires_at > datetime('now'))`,
            [token]
        );
    }

    // Get all invitations for a station
    static async findByStation(stationId) {
        return await query(
            `SELECT i.*, u.realname as created_by_name
             FROM invitations i
             LEFT JOIN users u ON i.created_by = u.id
             WHERE i.station_id = ?
             ORDER BY i.created_at DESC`,
            [stationId]
        );
    }

    // Mark invitation as used
    static async markUsed(token, userId) {
        return await run(
            `UPDATE invitations 
             SET used = TRUE, status = 'accepted', responded_at = datetime('now')
             WHERE token = ?`,
            [token]
        );
    }

    // Revoke invitation
    static async revoke(invitationId) {
        return await run(
            `UPDATE invitations 
             SET status = 'revoked'
             WHERE id = ?`,
            [invitationId]
        );
    }

    // Get all invitations for admin
    static async findAll() {
        return await query(
            `SELECT i.*, s.name as station_name, s.lz_number, c.name as city_name, 
                    u.realname as created_by_name,
                    CASE 
                        WHEN i.expires_at < datetime('now') THEN 'expired'
                        WHEN i.used = TRUE THEN 'used'
                        WHEN i.status = 'revoked' THEN 'revoked'
                        ELSE 'active'
                    END as current_status
             FROM invitations i
             LEFT JOIN stations s ON i.station_id = s.id
             LEFT JOIN cities c ON s.city_id = c.id
             LEFT JOIN users u ON i.created_by = u.id
             ORDER BY i.created_at DESC`
        );
    }

    // Get station invitations statistics
    static async getStationStats(stationId) {
        const result = await get(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN used = TRUE THEN 1 ELSE 0 END) as used,
                SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked,
                SUM(CASE WHEN expires_at < datetime('now') AND used = FALSE AND status != 'revoked' THEN 1 ELSE 0 END) as expired
             FROM invitations
             WHERE station_id = ?`,
            [stationId]
        );
        return result;
    }

    // Generate QR Code URL (returns invitation link)
    static getQRUrl(token, baseUrl) {
        return `${baseUrl}/auth/register-with-invitation/${token}`;
    }
}

module.exports = Invitation;
