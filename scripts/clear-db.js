const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './database.sqlite';
const db = new sqlite3.Database(path.resolve(DB_PATH));

db.serialize(() => {
    db.run('PRAGMA foreign_keys = OFF');
    
    // Delete all data except districts
    db.run('DELETE FROM quiz_questions', (err) => {
        if (err) console.error('Error deleting quiz_questions:', err);
        else console.log('✓ quiz_questions cleared');
    });
    
    db.run('DELETE FROM submissions', (err) => {
        if (err) console.error('Error deleting submissions:', err);
        else console.log('✓ submissions cleared');
    });
    
    db.run('DELETE FROM challenges', (err) => {
        if (err) console.error('Error deleting challenges:', err);
        else console.log('✓ challenges cleared');
    });
    
    db.run('DELETE FROM users WHERE role != "super_admin"', (err) => {
        if (err) console.error('Error deleting users:', err);
        else console.log('✓ users cleared (except admin)');
    });
    
    db.run('DELETE FROM stations', (err) => {
        if (err) console.error('Error deleting stations:', err);
        else console.log('✓ stations cleared');
    });
    
    db.run('DELETE FROM cities', (err) => {
        if (err) console.error('Error deleting cities:', err);
        else console.log('✓ cities cleared');
    });
    
    // Reset admin password if needed
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hash, 'admin@feuerwehr-challenge.de'], (err) => {
        if (err) console.error('Error updating admin:', err);
        else console.log('✓ Admin password set to: admin123');
    });
    
    // Show remaining districts
    db.all('SELECT * FROM districts', [], (err, rows) => {
        if (err) console.error('Error:', err);
        else {
            console.log('\n📍 Remaining districts:');
            rows.forEach(r => console.log(`  - ${r.name}`));
        }
    });
    
    db.run('PRAGMA foreign_keys = ON');
});

db.close(() => {
    console.log('\n✅ Database cleared successfully');
    console.log('Only NRW districts remain. You can now build everything from scratch.');
});
