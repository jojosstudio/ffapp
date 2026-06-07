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

// Generate correct hash for admin123
const password = 'admin123';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('Generated hash for "admin123":', hash);

// Update admin user with correct hash
db.run(
    'UPDATE users SET password_hash = ? WHERE email = ?',
    [hash, 'admin@feuerwehr-challenge.de'],
    function(err) {
        if (err) {
            console.error('Error updating admin:', err.message);
            db.close();
            process.exit(1);
        }
        
        if (this.changes === 0) {
            console.log('No user found with that email');
        } else {
            console.log('Admin password updated successfully!');
            
            // Verify it works
            db.get('SELECT password_hash FROM users WHERE email = ?', ['admin@feuerwehr-challenge.de'], (err, row) => {
                if (err) {
                    console.error('Error:', err);
                    db.close();
                    return;
                }
                
                const valid = bcrypt.compareSync('admin123', row.password_hash);
                console.log('Verification test:', valid ? '✓ SUCCESS' : '✗ FAILED');
                db.close();
            });
        }
    }
);
