const { query, run, get } = require('./db');

class Station {
    static async findAll(verified = null, excludeWithZugfuehrer = false) {
        let sql = `
            SELECT s.*, c.name as city_name, c.type as city_type, st.name as state_name, st.country
            FROM stations s
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
        `;
        const params = [];
        const conditions = [];
        
        if (verified !== null) {
            conditions.push('s.verified = ?');
            params.push(verified);
        }
        
        if (excludeWithZugfuehrer) {
            conditions.push(`s.id NOT IN (SELECT station_id FROM users WHERE role = 'zugfuehrer' AND active = TRUE)`);
        }
        
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY st.name, c.name, s.lz_number';
        
        return await query(sql, params);
    }

    static async findById(id) {
        return await get(`
            SELECT s.*, c.name as city_name, c.type as city_type, st.name as state_name, st.country
            FROM stations s
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            WHERE s.id = ?
        `, [id]);
    }

    static async findByCity(cityId) {
        return await query(`
            SELECT s.*, c.name as city_name, st.name as state_name
            FROM stations s
            LEFT JOIN cities c ON s.city_id = c.id
            LEFT JOIN states st ON c.state_id = st.id
            WHERE s.city_id = ?
            ORDER BY s.lz_number
        `, [cityId]);
    }

    static async create(data) {
        const { city_id, lz_number, name } = data;
        
        const result = await run(`
            INSERT INTO stations (city_id, lz_number, name)
            VALUES (?, ?, ?)
        `, [city_id, lz_number, name]);
        
        return result.id;
    }

    static async update(id, data) {
        const updates = [];
        const values = [];
        
        if (data.name !== undefined) {
            updates.push('name = ?');
            values.push(data.name);
        }
        if (data.lz_number !== undefined) {
            updates.push('lz_number = ?');
            values.push(data.lz_number);
        }
        if (data.verified !== undefined) {
            updates.push('verified = ?');
            values.push(data.verified);
        }
        
        if (updates.length === 0) return { changes: 0 };
        
        values.push(id);
        return await run(`
            UPDATE stations SET ${updates.join(', ')} WHERE id = ?
        `, values);
    }

    static async verify(id) {
        return await run('UPDATE stations SET verified = TRUE WHERE id = ?', [id]);
    }

    static async delete(id) {
        return await run('DELETE FROM stations WHERE id = ?', [id]);
    }

    // Get states with cities
    static async getNrwStructure(includeStations = false) {
        const states = await query(`
            SELECT st.*,
                   (SELECT COUNT(*) FROM cities WHERE state_id = st.id) as city_count
            FROM states st
            ORDER BY st.country, st.name
        `);

        for (const state of states) {
            state.cities = await query(`
                SELECT c.*,
                       (SELECT COUNT(*) FROM stations WHERE city_id = c.id) as station_count
                FROM cities c
                WHERE c.state_id = ?
                ORDER BY c.name
            `, [state.id]);

            if (includeStations) {
                for (const city of state.cities) {
                    city.stations = await query(`
                        SELECT * FROM stations
                        WHERE city_id = ? AND verified = TRUE
                        ORDER BY lz_number
                    `, [city.id]);
                }
            }
        }

        return states;
    }

    static async getStates() {
        return await query('SELECT * FROM states ORDER BY country, name');
    }

    static async getCitiesByState(stateId) {
        return await query(`
            SELECT c.*, (SELECT COUNT(*) FROM stations WHERE city_id = c.id) as station_count
            FROM cities c
            WHERE c.state_id = ?
            ORDER BY c.name
        `, [stateId]);
    }

    static async getCityById(cityId) {
        return await get(`
            SELECT c.*, st.name as state_name
            FROM cities c
            LEFT JOIN states st ON c.state_id = st.id
            WHERE c.id = ?
        `, [cityId]);
    }

    static async getStationsWithStatsForCity(cityId) {
        return await query(`
            SELECT s.*,
                   (SELECT COUNT(*) FROM users WHERE station_id = s.id AND active = TRUE) as member_count,
                   (SELECT COUNT(*) FROM invitations WHERE station_id = s.id AND status = 'pending'
                    AND (expires_at IS NULL OR expires_at > datetime('now'))) as pending_invitations,
                   (SELECT COUNT(*) FROM submissions sub
                    JOIN users u ON sub.user_id = u.id
                    WHERE u.station_id = s.id AND sub.status = 'pending') as pending_submissions
            FROM stations s
            WHERE s.city_id = ?
            ORDER BY s.lz_number
        `, [cityId]);
    }

    // Get pending invitations for a station
    static async getPendingInvitations(stationId) {
        return await query(`
            SELECT i.*, u.realname as created_by_name, u.nickname as created_by_nickname,
                   applicant.realname as applicant_realname, applicant.nickname as applicant_nickname
            FROM invitations i
            JOIN users u ON i.created_by = u.id
            LEFT JOIN users applicant ON i.email = applicant.email AND applicant.active = TRUE
            WHERE i.station_id = ?
              AND i.status = 'pending'
              AND (i.expires_at IS NULL OR i.expires_at > datetime('now'))
            ORDER BY i.created_at DESC
        `, [stationId]);
    }

    // Get user's own station applications (Bewerbungen)
    static async getUserStationApplications(userId, email) {
        return await query(`
            SELECT i.*,
                   s.name as station_name, s.lz_number,
                   c.name as city_name
            FROM invitations i
            JOIN stations s ON i.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            WHERE i.created_by = ? AND i.email = ?
            ORDER BY i.created_at DESC
        `, [userId, email]);
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

module.exports = Station;