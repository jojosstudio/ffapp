const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './database.sqlite';

const db = new sqlite3.Database(path.resolve(DB_PATH), (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Auto-migrate leitstelle (city_id + role)
const { execFile } = require('child_process');
const pathModule = require('path');
db.all('PRAGMA table_info(users)', (err, columns) => {
    if (err || !columns) return;
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('city_id')) {
        execFile(process.execPath, [pathModule.join(__dirname, '../scripts/migrate-leitstelle.js')], (e) => {
            if (e) console.error('Leitstelle migration error:', e.message);
        });
    }
});
db.all('PRAGMA table_info(invitations)', (err, columns) => {
    if (err || !columns) return;
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('status')) {
        db.run("ALTER TABLE invitations ADD COLUMN status TEXT DEFAULT 'pending'", () => {
            db.run("UPDATE invitations SET status = 'pending' WHERE status IS NULL AND used = FALSE");
            db.run("UPDATE invitations SET status = 'accepted' WHERE status IS NULL AND used = TRUE");
        });
    }
    if (!columnNames.includes('responded_at')) {
        db.run('ALTER TABLE invitations ADD COLUMN responded_at DATETIME');
    }
});

// Helper function for promisified queries
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

module.exports = {
    db,
    query,
    run,
    get
};
