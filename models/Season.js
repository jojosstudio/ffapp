const { query, run, get } = require('./db');

class Season {
    /**
     * Get the currently active season
     */
    static async getActive() {
        let season = await get(`
            SELECT * FROM seasons 
            WHERE active = TRUE 
            AND start_date <= datetime('now') 
            AND end_date > datetime('now')
            ORDER BY start_date DESC LIMIT 1
        `);
        
        // If no active season exists, create one
        if (!season) {
            season = await this.createNext();
        }
        
        return season;
    }

    /**
     * Create the next season (monthly, starting 1st 00:00)
     */
    static async createNext() {
        // Find the latest season end date or default to current month
        const lastSeason = await get('SELECT * FROM seasons ORDER BY end_date DESC LIMIT 1');
        
        let startDate, endDate, name;
        const now = new Date();
        
        if (lastSeason) {
            // Start from end of last season
            startDate = new Date(lastSeason.end_date);
        } else {
            // Start from beginning of current month
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        }
        
        // End at beginning of next month
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        // Format as ISO strings for SQLite
        const startStr = startDate.toISOString().replace('T', ' ').substring(0, 19);
        const endStr = endDate.toISOString().replace('T', ' ').substring(0, 19);
        
        // Season name: "Monat YYYY"
        const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        name = `${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
        
        // Deactivate all previous seasons
        await run('UPDATE seasons SET active = FALSE WHERE active = TRUE');
        
        const result = await run(`
            INSERT INTO seasons (name, start_date, end_date, active)
            VALUES (?, ?, ?, TRUE)
        `, [name, startStr, endStr]);
        
        return await get('SELECT * FROM seasons WHERE id = ?', [result.id]);
    }

    /**
     * Get all seasons for history
     */
    static async getAll() {
        return await query('SELECT * FROM seasons ORDER BY start_date DESC');
    }

    /**
     * Get season by ID
     */
    static async getById(id) {
        return await get('SELECT * FROM seasons WHERE id = ?', [id]);
    }

    /**
     * Save season points for a user after a submission
     */
    static async recordPoints(userId, points) {
        const season = await this.getActive();
        if (!season) return null;
        
        // Upsert: insert or add points
        const existing = await get(`
            SELECT * FROM season_points_history 
            WHERE user_id = ? AND season_id = ?
        `, [userId, season.id]);
        
        if (existing) {
            await run(`
                UPDATE season_points_history 
                SET points_earned = points_earned + ?
                WHERE user_id = ? AND season_id = ?
            `, [points, userId, season.id]);
        } else {
            await run(`
                INSERT INTO season_points_history (user_id, season_id, points_earned)
                VALUES (?, ?, ?)
            `, [userId, season.id, points]);
        }
        
        // Also update station season points
        const user = await get('SELECT station_id FROM users WHERE id = ?', [userId]);
        if (user && user.station_id) {
            const stationExisting = await get(`
                SELECT * FROM station_season_points 
                WHERE station_id = ? AND season_id = ?
            `, [user.station_id, season.id]);
            
            const memberCount = await get(`
                SELECT COUNT(*) as count FROM users 
                WHERE station_id = ? AND active = TRUE AND role IN ('ff', 'jf')
            `, [user.station_id]);
            
            if (stationExisting) {
                await run(`
                    UPDATE station_season_points 
                    SET total_points = total_points + ?, member_count = ?
                    WHERE station_id = ? AND season_id = ?
                `, [points, memberCount.count, user.station_id, season.id]);
            } else {
                await run(`
                    INSERT INTO station_season_points (station_id, season_id, total_points, member_count)
                    VALUES (?, ?, ?, ?)
                `, [user.station_id, season.id, points, memberCount.count]);
            }
        }
        
        return season;
    }

    /**
     * Get season rankings for a specific season
     */
    static async getSeasonRankings(seasonId, targetGroup = 'both') {
        let whereClause = 'WHERE u.active = TRUE AND sph.season_id = ?';
        const params = [seasonId];
        
        if (targetGroup !== 'both') {
            whereClause += ' AND u.role = ?';
            params.push(targetGroup);
        } else {
            whereClause += ' AND u.role IN ("ff", "jf")';
        }
        
        return await query(`
            SELECT 
                u.id,
                u.nickname,
                u.role,
                sph.points_earned,
                sph.rank_position,
                s.name as station_name,
                s.lz_number,
                c.name as city_name
            FROM season_points_history sph
            JOIN users u ON sph.user_id = u.id
            LEFT JOIN stations s ON u.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            ${whereClause}
            ORDER BY sph.points_earned DESC
        `, params);
    }

    /**
     * Get station rankings for a specific season
     */
    static async getStationSeasonRankings(seasonId) {
        return await query(`
            SELECT 
                s.id as station_id,
                s.name as station_name,
                s.lz_number,
                c.name as city_name,
                ssp.total_points,
                ssp.member_count
            FROM station_season_points ssp
            JOIN stations s ON ssp.station_id = s.id
            LEFT JOIN cities c ON s.city_id = c.id
            WHERE ssp.season_id = ?
            ORDER BY ssp.total_points DESC
        `, [seasonId]);
    }

    /**
     * Reset all user points for a new season (keeps history)
     */
    static async resetSeasonPoints() {
        // Save current rankings before reset
        const season = await this.getActive();
        if (!season) return;
        
        // Save rank positions
        const rankings = await query(`
            SELECT id, points FROM users 
            WHERE active = TRUE AND role IN ('ff', 'jf')
            ORDER BY points DESC
        `);
        
        for (let i = 0; i < rankings.length; i++) {
            const existing = await get(`
                SELECT * FROM season_points_history 
                WHERE user_id = ? AND season_id = ?
            `, [rankings[i].id, season.id]);
            
            if (!existing) {
                await run(`
                    INSERT INTO season_points_history (user_id, season_id, points_earned, rank_position)
                    VALUES (?, ?, ?, ?)
                `, [rankings[i].id, season.id, rankings[i].points || 0, i + 1]);
            } else {
                await run(`
                    UPDATE season_points_history 
                    SET rank_position = ?
                    WHERE user_id = ? AND season_id = ?
                `, [i + 1, rankings[i].id, season.id]);
            }
        }
        
        // Save station rankings
        const stationRankings = await query(`
            SELECT s.id, COUNT(u.id) as member_count, SUM(u.points) as total_points
            FROM stations s
            JOIN users u ON s.id = u.station_id AND u.active = TRUE
            WHERE u.role IN ('ff', 'jf')
            GROUP BY s.id
            ORDER BY total_points DESC
        `);
        
        for (const sr of stationRankings) {
            const existing = await get(`
                SELECT * FROM station_season_points 
                WHERE station_id = ? AND season_id = ?
            `, [sr.id, season.id]);
            
            if (!existing) {
                await run(`
                    INSERT INTO station_season_points (station_id, season_id, total_points, member_count)
                    VALUES (?, ?, ?, ?)
                `, [sr.id, season.id, sr.total_points || 0, sr.member_count || 0]);
            }
        }
        
        // Reset all user points to 0
        await run('UPDATE users SET points = 0 WHERE role IN ("ff", "jf")');
        
        // Create new season
        await this.createNext();
    }

    /**
     * Calculate next reset (1st of next month 00:00)
     */
    static getNextResetDate() {
        const now = new Date();
        const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
        return nextReset;
    }

    /**
     * Get seconds until next reset
     */
    static getSecondsUntilReset() {
        const now = new Date();
        const nextReset = this.getNextResetDate();
        return Math.floor((nextReset - now) / 1000);
    }
}

module.exports = Season;