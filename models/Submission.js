const { query, run, get } = require('./db');

class Submission {
    static async findAll(filters = {}) {
        let sql = `
            SELECT s.*, 
                   u.nickname as user_nickname,
                   u.realname as user_realname,
                   u.station_id,
                   c.title as challenge_title,
                   c.type as challenge_type,
                   c.points as max_points,
                   reviewer.nickname as reviewer_nickname
            FROM submissions s
            JOIN users u ON s.user_id = u.id
            JOIN challenges c ON s.challenge_id = c.id
            LEFT JOIN users reviewer ON s.reviewed_by = reviewer.id
        `;
        const params = [];
        const conditions = [];
        
        if (filters.status) {
            conditions.push('s.status = ?');
            params.push(filters.status);
        }
        
        if (filters.user_id) {
            conditions.push('s.user_id = ?');
            params.push(filters.user_id);
        }
        
        if (filters.challenge_id) {
            conditions.push('s.challenge_id = ?');
            params.push(filters.challenge_id);
        }
        
        if (filters.station_id) {
            conditions.push('u.station_id = ?');
            params.push(filters.station_id);
        }
        
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY s.created_at DESC';
        
        return await query(sql, params);
    }

    static async findById(id) {
        return await get(`
            SELECT s.*, 
                   u.nickname as user_nickname,
                   u.realname as user_realname,
                   u.station_id,
                   c.title as challenge_title,
                   c.type as challenge_type,
                   c.points as max_points,
                   reviewer.nickname as reviewer_nickname
            FROM submissions s
            JOIN users u ON s.user_id = u.id
            JOIN challenges c ON s.challenge_id = c.id
            LEFT JOIN users reviewer ON s.reviewed_by = reviewer.id
            WHERE s.id = ?
        `, [id]);
    }

    static async create(data) {
        const { user_id, challenge_id, answer_data, proof_image } = data;
        
        const result = await run(`
            INSERT INTO submissions (user_id, challenge_id, answer_data, proof_image)
            VALUES (?, ?, ?, ?)
        `, [user_id, challenge_id, JSON.stringify(answer_data), proof_image]);
        
        return result.id;
    }

    static async review(id, reviewer_id, status, points_awarded, feedback) {
        return await run(`
            UPDATE submissions 
            SET status = ?, 
                reviewed_by = ?, 
                reviewed_at = CURRENT_TIMESTAMP,
                points_awarded = ?,
                feedback = ?
            WHERE id = ?
        `, [status, reviewer_id, points_awarded, feedback, id]);
    }

    static async updateUserPoints(userId) {
        // Recalculate user's total points from approved submissions
        const result = await get(`
            SELECT COALESCE(SUM(points_awarded), 0) as total_points
            FROM submissions
            WHERE user_id = ? AND status = 'approved'
        `, [userId]);
        
        await run('UPDATE users SET points = ? WHERE id = ?', [
            result.total_points,
            userId
        ]);
        
        return result.total_points;
    }

    static async getPendingForStation(stationId) {
        return await query(`
            SELECT s.*, 
                   u.nickname as user_nickname,
                   u.realname as user_realname,
                   c.title as challenge_title,
                   c.description as challenge_description,
                   c.points as max_points
            FROM submissions s
            JOIN users u ON s.user_id = u.id
            JOIN challenges c ON s.challenge_id = c.id
            WHERE s.status = 'pending'
            AND u.station_id = ?
            AND c.type = 'praxis'
            ORDER BY s.created_at ASC
        `, [stationId]);
    }

    static async getUserStats(userId) {
        return await get(`
            SELECT 
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as completed_count,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN points_awarded END), 0) as total_points
            FROM submissions
            WHERE user_id = ?
        `, [userId]);
    }

    static async hasCompleted(userId, challengeId) {
        const result = await get(`
            SELECT 1 as exists_check
            FROM submissions
            WHERE user_id = ? AND challenge_id = ? AND status IN ('pending', 'approved')
        `, [userId, challengeId]);
        
        return !!result;
    }
}

module.exports = Submission;
