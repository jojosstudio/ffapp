// Migration: Add states table, convert from districts to states hierarchy
const { run, query } = require('../models/db');

(async () => {
    try {
        // 1. Create states table
        await run(`
            CREATE TABLE IF NOT EXISTS states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                country TEXT NOT NULL DEFAULT 'Deutschland',
                UNIQUE(name, country)
            )
        `);
        console.log('✅ Created states table');

        // 2. Insert NRW
        await run(`INSERT OR IGNORE INTO states (name, country) VALUES ('Nordrhein-Westfalen', 'Deutschland')`);
        console.log('✅ Inserted Nordrhein-Westfalen');

        // 3. Check if cities already have state_id column
        const tableInfo = await query('PRAGMA table_info(cities)');
        const hasStateId = tableInfo.some(c => c.name === 'state_id');
        
        if (!hasStateId) {
            // Add state_id column
            await run('ALTER TABLE cities ADD COLUMN state_id INTEGER DEFAULT 1');
            console.log('✅ Added state_id to cities');
            
            // Update all cities to state_id = 1 (NRW)
            await run('UPDATE cities SET state_id = 1 WHERE state_id IS NULL');
            console.log('✅ Updated cities with state_id');
        } else {
            console.log('ℹ️ state_id column already exists');
        }

        // 4. Drop old districts table (safely - just the table, keep cities data)
        const hasDistricts = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='districts'");
        if (hasDistricts.length > 0) {
            await run('DROP TABLE IF EXISTS districts');
            console.log('✅ Dropped old districts table');
        }

        console.log('✅ Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
})();