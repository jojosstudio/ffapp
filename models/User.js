const { query, run, get } = require('./db');
const bcrypt = require('bcryptjs');

class User {
    static async findAll() {
        return await query(`
            SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name, st.name as state_name, st.country,
                   lc.name as assigned_city_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            LEFT JOIN cities lc ON u.city_id = lc.id
            WHERE u.active = TRUE
            ORDER BY u.realname ASC
        `);
    }

    static async findByIdAdmin(id) {
        return await get(`
            SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name, st.name as state_name,
                   lc.name as assigned_city_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            LEFT JOIN cities lc ON u.city_id = lc.id
            WHERE u.id = ?
        `, [id]);
    }

    static async findById(id) {
        return await get(`
            SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name, st.name as state_name,
                   lc.name as assigned_city_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            LEFT JOIN cities lc ON u.city_id = lc.id
            WHERE u.id = ? AND u.active = TRUE
        `, [id]);
    }

    static async findByEmail(email) {
        return await get(`
            SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            WHERE u.email = ? AND u.active = TRUE
        `, [email]);
    }

    static async findByNickname(nickname) {
        return await get(`
            SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            WHERE u.nickname = ? AND u.active = TRUE
        `, [nickname]);
    }

    static async findByStation(stationId) {
        return await query(`
            SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            WHERE u.station_id = ? AND u.active = TRUE
            ORDER BY u.points DESC
        `, [stationId]);
    }

    static async create(data) {
        const { realname, nickname, email, password, role = 'ff', station_id, phone, dienstgrad, dienstjahre, geburtsdatum, plz, is_expelled = false } = data;
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;
        
        const result = await run(`
            INSERT INTO users (realname, nickname, email, password_hash, role, station_id, phone, dienstgrad, dienstjahre, geburtsdatum, plz)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [realname, nickname, email, passwordHash, role, station_id, phone || null, dienstgrad || null, dienstjahre || 0, geburtsdatum || null, plz || null]);
        
        return result.id;
    }

    static async update(id, data) {
        const updates = [];
        const values = [];
        
        if (data.realname !== undefined) {
            updates.push('realname = ?');
            values.push(data.realname);
        }
        if (data.nickname !== undefined) {
            updates.push('nickname = ?');
            values.push(data.nickname);
        }
        if (data.email !== undefined) {
            updates.push('email = ?');
            values.push(data.email);
        }
        if (data.password) {
            updates.push('password_hash = ?');
            values.push(await bcrypt.hash(data.password, 10));
        }
        if (data.role !== undefined) {
            updates.push('role = ?');
            values.push(data.role);
        }
        if (data.station_id !== undefined) {
            updates.push('station_id = ?');
            values.push(data.station_id);
        }
        if (data.city_id !== undefined) {
            updates.push('city_id = ?');
            values.push(data.city_id);
        }
        if (data.points !== undefined) {
            updates.push('points = ?');
            values.push(data.points);
        }
        if (data.active !== undefined) {
            updates.push('active = ?');
            values.push(data.active);
        }
        
        if (updates.length === 0) return { changes: 0 };
        
        values.push(id);
        return await run(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `, values);
    }

    static async delete(id) {
        return await run('UPDATE users SET active = FALSE WHERE id = ?', [id]);
    }

    static async verifyPassword(user, password) {
        if (!user || !user.password_hash) return false;
        return await bcrypt.compare(password, user.password_hash);
    }

    static async updateLastLogin(id) {
        return await run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    }

    // Get public rankings (nicknames only, no real names)
    static async getPublicRankings(targetGroup = 'both') {
        let whereClause = 'WHERE u.active = TRUE';
        const params = [];
        
        if (targetGroup !== 'both') {
            whereClause += ' AND u.role = ?';
            params.push(targetGroup);
        } else {
            whereClause += ' AND u.role IN ("ff", "jf")';
        }
        
        whereClause += ' AND (c.excluded_from_rankings IS NULL OR c.excluded_from_rankings = 0)';
        
        return await query(`
            SELECT 
                u.id,
                u.nickname,
                u.points,
                u.role,
                s.name as station_name,
                s.lz_number,
                c.name as city_name,
                st.name as state_name
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            ${whereClause}
            ORDER BY u.points DESC, u.nickname ASC
        `, params);
    }

    // Get internal rankings for station members (shows real names)
    static async getInternalRankings(stationId) {
        return await query(`
            SELECT 
                u.id,
                u.realname,
                u.nickname,
                u.points,
                u.role,
                u.created_at
            FROM users u
            WHERE u.station_id = ? AND u.active = TRUE AND u.role IN ("ff", "jf", "zugfuehrer")
            ORDER BY u.points DESC, u.realname ASC
        `, [stationId]);
    }

    // Get station rankings (aggregated by station)
    static async getStationRankings() {
        return await query(`
            SELECT 
                s.id as station_id,
                s.name as station_name,
                s.lz_number,
                c.name as city_name,
                st.name as state_name,
                COUNT(u.id) as member_count,
                SUM(u.points) as total_points,
                AVG(u.points) as avg_points
            FROM stations s
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            LEFT JOIN users u ON s.id = u.station_id AND u.active = TRUE
            WHERE s.verified = TRUE AND (c.excluded_from_rankings IS NULL OR c.excluded_from_rankings = 0)
            GROUP BY s.id
            HAVING COUNT(u.id) > 0
            ORDER BY total_points DESC
        `);
    }
}

module.exports = User;