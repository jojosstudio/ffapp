const db = require('../models/db');

async function migrate() {
    try {
        const columns = await db.query('PRAGMA table_info(invitations)');
        const columnNames = columns.map(c => c.name);

        if (!columnNames.includes('status')) {
            await db.run(`ALTER TABLE invitations ADD COLUMN status TEXT DEFAULT 'pending'`);
            console.log('✅ Added status column to invitations');
        }

        if (!columnNames.includes('responded_at')) {
            await db.run(`ALTER TABLE invitations ADD COLUMN responded_at DATETIME`);
            console.log('✅ Added responded_at column to invitations');
        }

        await db.run(`UPDATE invitations SET status = 'pending' WHERE status IS NULL AND used = FALSE`);
        await db.run(`UPDATE invitations SET status = 'accepted' WHERE status IS NULL AND used = TRUE`);

        console.log('✅ Invitation status migration completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
