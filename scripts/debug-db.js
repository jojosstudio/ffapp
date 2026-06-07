const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './database.sqlite';

const db = new sqlite3.Database(path.resolve(DB_PATH), (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database\n');
});

async function debug() {
    // Check all users
    console.log('=== Alle Nutzer in der Datenbank ===');
    db.all('SELECT id, realname, nickname, email, role, active, password_hash FROM users', [], (err, rows) => {
        if (err) {
            console.error('Error:', err.message);
            return;
        }
        
        if (rows.length === 0) {
            console.log('KEINE NUTZER GEFUNDEN!');
        } else {
            rows.forEach(row => {
                console.log(`ID: ${row.id}`);
                console.log(`  Name: ${row.realname} (${row.nickname})`);
                console.log(`  Email: ${row.email}`);
                console.log(`  Role: ${row.role}`);
                console.log(`  Active: ${row.active}`);
                console.log(`  Hash exists: ${row.password_hash ? 'YES' : 'NO'}`);
                console.log(`  Hash: ${row.password_hash ? row.password_hash.substring(0, 20) + '...' : 'NONE'}`);
                console.log('');
            });
        }
        
        // Test password verification
        if (rows.length > 0 && rows[0].password_hash) {
            console.log('\n=== Test Passwort-Verifikation ===');
            const testPassword = 'admin123';
            bcrypt.compare(testPassword, rows[0].password_hash, (err, result) => {
                if (err) {
                    console.log('Bcrypt Error:', err.message);
                } else {
                    console.log(`Passwort "admin123" für ${rows[0].email}: ${result ? '✓ KORREKT' : '✗ FALSCH'}`);
                }
                db.close();
            });
        } else {
            db.close();
        }
    });
}

debug();
