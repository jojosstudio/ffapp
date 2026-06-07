const { query, run, get } = require('./db');

class DailyChallenge {
    /**
     * Get today's daily challenge (changes at 12:00)
     */
    static async getToday() {
        // Calculate the active date based on 12:00 cutoff
        // If before 12:00, use yesterday's date as the challenge is still active
        // If after 12:00, use today's date
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // Active date changes at 12:00 (noon)
        // Before 12:00 -> still yesterday's challenge
        // After 12:00 -> today's challenge
        const challengeDate = new Date(now);
        if (hours < 12 || (hours === 12 && minutes === 0)) {
            // Before 12:00 - use yesterday
            challengeDate.setDate(challengeDate.getDate() - 1);
        }
        // After 12:00 - use today (default)
        
        const dateStr = challengeDate.toISOString().substring(0, 10);
        
        // Try to get existing daily challenge for this date
        let daily = await get(`
            SELECT dc.*, c.title, c.description, c.type, c.target_group, c.points, 
                   c.points * dc.multiplier as total_points,
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count
            FROM daily_challenges dc
            JOIN challenges c ON dc.challenge_id = c.id
            WHERE dc.active_date = ? AND dc.active = TRUE
        `, [dateStr]);
        
        // If no daily challenge exists for today, create one
        if (!daily) {
            daily = await this.createForDate(dateStr);
        }
        
        return daily;
    }

    /**
     * Create a daily challenge for a specific date
     */
    static async createForDate(dateStr) {
        // Get a random active challenge
        const challenges = await query(`
            SELECT id FROM challenges 
            WHERE active = TRUE AND type = 'theorie'
            ORDER BY RANDOM() LIMIT 1
        `);
        
        if (challenges.length === 0) return null;
        
        const challengeId = challenges[0].id;
        
        // Deactivate any old daily challenge for this date (just in case)
        await run('UPDATE daily_challenges SET active = FALSE WHERE active_date = ?', [dateStr]);
        
        // Create new daily challenge with 2x multiplier
        await run(`
            INSERT OR REPLACE INTO daily_challenges (challenge_id, active_date, multiplier, active)
            VALUES (?, ?, 2, TRUE)
        `, [challengeId, dateStr]);
        
        // Return the created daily challenge with full info
        return await get(`
            SELECT dc.*, c.title, c.description, c.type, c.target_group, c.points,
                   c.points * dc.multiplier as total_points,
                   (SELECT COUNT(*) FROM quiz_questions WHERE challenge_id = c.id) as question_count
            FROM daily_challenges dc
            JOIN challenges c ON dc.challenge_id = c.id
            WHERE dc.active_date = ? AND dc.active = TRUE
        `, [dateStr]);
    }

    /**
     * Get seconds until next daily challenge change (12:00)
     */
    static getSecondsUntilNext() {
        const now = new Date();
        const nextChange = new Date(now);
        
        // If before 12:00, next change is today at 12:00
        // If after 12:00, next change is tomorrow at 12:00
        if (now.getHours() < 12) {
            nextChange.setHours(12, 0, 0, 0);
        } else {
            nextChange.setDate(nextChange.getDate() + 1);
            nextChange.setHours(12, 0, 0, 0);
        }
        
        return Math.floor((nextChange - now) / 1000);
    }

    /**
     * Format seconds into HH:MM:SS
     */
    static formatCountdown(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * Check if current time is in double-points period
     */
    static isDoublePointsActive() {
        const now = new Date();
        const hours = now.getHours();
        // Double points active after 12:00 (noon)
        return hours >= 12;
    }
}

module.exports = DailyChallenge;