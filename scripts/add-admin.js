const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './database.sqlite';

const db = new sqlite3.Database(path.resolve(DB_PATH), (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Check if admin exists
db.get('SELECT id FROM users WHERE email = ?', ['admin@feuerwehr-challenge.de'], (err, row) => {
    if (err) {
        console.error('Error checking admin:', err.message);
        db.close();
        process.exit(1);
    }
    
    if (row) {
        console.log('Admin user already exists with ID:', row.id);
        db.close();
        process.exit(0);
    }
    
    // Insert admin user
    // Password: admin123
    // Hash: $2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
    const sql = `INSERT INTO users (realname, nickname, email, password_hash, role, points, active) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        'Super Admin',
        'Admin',
        'admin@feuerwehr-challenge.de',
        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'super_admin',
        0,
        1
    ], function(err) {
        if (err) {
            console.error('Error inserting admin:', err.message);
            db.close();
            process.exit(1);
        }
        
        console.log('Admin user created successfully with ID:', this.lastID);
        db.close();
    });
});
