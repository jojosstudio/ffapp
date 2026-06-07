const { query, run, get } = require('./db');

class Challenge {
    static async findAll(filters = {}) {
        let sql = `
            SELECT c.*, 
                   u.nickname as creator_nickname,
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count
            FROM challenges c
            LEFT JOIN users u ON c.created_by = u.id
            WHERE c.active = TRUE
        `;
        const params = [];
        
        if (filters.type) {
            sql += ' AND c.type = ?';
            params.push(filters.type);
        }
        
        if (filters.target_group && filters.target_group !== 'both') {
            sql += ' AND (c.target_group = ? OR c.target_group = "both")';
            params.push(filters.target_group);
        }
        
        sql += ' ORDER BY c.created_at DESC';
        
        return await query(sql, params);
    }

    static async findAllForAdmin() {
        return await query(`
            SELECT c.*,
                   u.nickname as creator_nickname,
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count,
                   (SELECT COUNT(*) FROM submissions WHERE challenge_id = c.id) as submission_count
            FROM challenges c
            LEFT JOIN users u ON c.created_by = u.id
            ORDER BY c.active DESC, c.created_at DESC
        `);
    }

    static async findById(id) {
        return await get(`
            SELECT c.*, u.nickname as creator_nickname
            FROM challenges c
            LEFT JOIN users u ON c.created_by = u.id
            WHERE c.id = ? AND c.active = TRUE
        `, [id]);
    }

    static async findWithQuestions(id) {
        const challenge = await this.findById(id);
        if (!challenge) return null;
        
        const questions = await query(`
            SELECT id, question, option_a, option_b, option_c, option_d, correct_answer 
            FROM quiz_questions 
            WHERE challenge_id = ?
        `, [id]);
        
        // Convert to options array format for compatibility
        challenge.questions = questions.map(q => ({
            id: q.id,
            question: q.question,
            options: [q.option_a, q.option_b, q.option_c, q.option_d].filter(o => o),
            correct_answer: q.correct_answer
        }));
        
        return challenge;
    }

    static async create(data) {
        const { title, description, type, target_group = 'both', points = 10, created_by } = data;
        
        const result = await run(`
            INSERT INTO challenges (title, description, type, target_group, points, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [title, description, type, target_group, points, created_by]);
        
        return result.id;
    }

    static async addQuestion(challengeId, question, options, correctAnswer) {
        return await run(`
            INSERT INTO quiz_questions (challenge_id, question, option_a, option_b, option_c, option_d, correct_answer)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [challengeId, question, options[0] || '', options[1] || '', options[2] || '', options[3] || '', correctAnswer]);
    }

    static async update(id, data) {
        const updates = [];
        const values = [];
        
        if (data.title !== undefined) {
            updates.push('title = ?');
            values.push(data.title);
        }
        if (data.description !== undefined) {
            updates.push('description = ?');
            values.push(data.description);
        }
        if (data.type !== undefined) {
            updates.push('type = ?');
            values.push(data.type);
        }
        if (data.target_group !== undefined) {
            updates.push('target_group = ?');
            values.push(data.target_group);
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
            UPDATE challenges SET ${updates.join(', ')} WHERE id = ?
        `, values);
    }

    static async delete(id) {
        return await run('UPDATE challenges SET active = FALSE WHERE id = ?', [id]);
    }

    // Get available challenges for user (excluding completed ones)
    static async getAvailableForUser(userId, role) {
        const targetGroup = role === 'jf' ? 'jf' : 'ff';
        
        return await query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count,
                   (SELECT COUNT(*) FROM submissions 
                    WHERE challenge_id = c.id AND user_id = ? AND status IN ('pending', 'approved')) as completed
            FROM challenges c
            WHERE c.active = TRUE
            AND (c.target_group = ? OR c.target_group = 'both')
            AND NOT EXISTS (
                SELECT 1 FROM submissions 
                WHERE challenge_id = c.id AND user_id = ? AND status IN ('pending', 'approved')
            )
            ORDER BY c.created_at DESC
        `, [userId, targetGroup, userId]);
    }

    // ============ NEUE METHODEN FÜR COOLDOWN-SYSTEM ============

    // Check if user is on cooldown for a specific challenge
    static async getCooldown(userId, challengeId) {
        const cooldown = await get(`
            SELECT * FROM user_challenge_cooldown 
            WHERE user_id = ? AND challenge_id = ?
        `, [userId, challengeId]);
        
        if (!cooldown) return null;
        
        const now = new Date();
        const cooldownUntil = new Date(cooldown.cooldown_until + 'Z');
        
        if (now >= cooldownUntil) {
            // Cooldown expired, clean up
            await run('DELETE FROM user_challenge_cooldown WHERE id = ?', [cooldown.id]);
            return null;
        }
        
        return cooldown;
    }
    
    // Set cooldown for a challenge (3 days)
    static async setCooldown(userId, challengeId) {
        const now = new Date();
        const cooldownUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
        
        const cooldownStr = cooldownUntil.toISOString().replace('T', ' ').substring(0, 19);
        
        await run(`
            INSERT OR REPLACE INTO user_challenge_cooldown (user_id, challenge_id, completed_at, cooldown_until)
            VALUES (?, ?, datetime('now'), ?)
        `, [userId, challengeId, cooldownStr]);
    }
    
    // Get available challenges for user with cooldown info (new/available ones only)
    static async getAvailableForUserWithCooldown(userId, role) {
        const targetGroup = role === 'jf' ? 'jf' : 'ff';
        
        return await query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count,
                   ucc.cooldown_until,
                   CASE 
                      WHEN ucc.cooldown_until IS NOT NULL AND ucc.cooldown_until > datetime('now') 
                      THEN 1 ELSE 0 
                   END as on_cooldown
            FROM challenges c
            LEFT JOIN user_challenge_cooldown ucc ON c.id = ucc.challenge_id AND ucc.user_id = ?
            WHERE c.active = TRUE
            AND (c.target_group = ? OR c.target_group = 'both')
            AND NOT EXISTS (
                SELECT 1 FROM submissions 
                WHERE challenge_id = c.id AND user_id = ? AND status IN ('pending', 'approved')
            )
            ORDER BY on_cooldown ASC, c.created_at DESC
        `, [userId, targetGroup, userId]);
    }

    // Get ALL challenges for user (including completed, with cooldown info)
    static async getAllForUserWithCooldown(userId, role) {
        const targetGroup = role === 'jf' ? 'jf' : 'ff';
        
        return await query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count,
                   ucc.cooldown_until,
                   CASE 
                      WHEN ucc.cooldown_until IS NOT NULL AND ucc.cooldown_until > datetime('now') 
                      THEN 1 ELSE 0 
                   END as on_cooldown,
                   CASE 
                      WHEN (SELECT COUNT(*) FROM submissions 
                            WHERE challenge_id = c.id AND user_id = ? AND status IN ('pending', 'approved')) > 0
                      THEN 1 ELSE 0 
                   END as is_completed
            FROM challenges c
            LEFT JOIN user_challenge_cooldown ucc ON c.id = ucc.challenge_id AND ucc.user_id = ?
            WHERE c.active = TRUE
            AND (c.target_group = ? OR c.target_group = 'both')
            ORDER BY is_completed ASC, on_cooldown ASC, c.created_at DESC
        `, [userId, userId, targetGroup]);
    }
}

module.exports = Challenge;