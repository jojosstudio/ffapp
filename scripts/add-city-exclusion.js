const { run } = require('../models/db');

async function migrate() {
    try {
        console.log('Adding excluded_from_rankings column to cities table...');
        await run("ALTER TABLE cities ADD COLUMN excluded_from_rankings BOOLEAN DEFAULT 0");
        console.log('Migration completed successfully!');
    } catch (error) {
        if (error.message.includes('duplicate column')) {
            console.log('Column already exists, skipping...');
        } else {
            console.error('Migration error:', error.message);
            process.exit(1);
        }
    }
}

migrate().then(() => process.exit(0));
