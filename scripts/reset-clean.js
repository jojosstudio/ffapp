const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './database.sqlite';
const dbPath = path.resolve(DB_PATH);

// Remove existing database
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Existing database removed');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error creating database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

db.run('PRAGMA foreign_keys = ON');

const schema = `
-- Regierungsbezirke (NRW)
CREATE TABLE districts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE
);

-- Kreise/Städte
CREATE TABLE cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    district_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('kreis', 'kreisfreie_stadt')) DEFAULT 'kreis',
    FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE,
    UNIQUE(district_id, name)
);

-- Löschzüge
CREATE TABLE stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    lz_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE(city_id, lz_number)
);

-- Benutzer - NUR Zugführer können sich registrieren!
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER,
    realname TEXT NOT NULL,
    nickname TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT CHECK(role IN ('super_admin', 'zugfuehrer')) DEFAULT 'zugfuehrer',
    points INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL
);

-- Challenges
CREATE TABLE challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('theorie', 'praxis')) NOT NULL,
    target_group TEXT CHECK(target_group IN ('ff', 'jf', 'both')) DEFAULT 'both',
    points INTEGER DEFAULT 10,
    created_by INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Quiz-Fragen
CREATE TABLE quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer INTEGER NOT NULL CHECK(correct_answer IN (0,1,2,3)),
    FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
);

-- Einreichungen
CREATE TABLE submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    answer_data TEXT,
    proof_image TEXT,
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    points_awarded INTEGER DEFAULT 0,
    feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- NRW-Regierungsbezirke (vorgegeben)
INSERT INTO districts (name, code) VALUES
('Arnsberg', 'ARN'),
('Detmold', 'DET'),
('Düsseldorf', 'DUS'),
('Köln', 'KOL'),
('Münster', 'MUN');

-- Super-Admin User
-- Password: admin123
-- Hash generated with bcrypt (10 rounds)
INSERT INTO users (realname, nickname, email, password_hash, role, points) VALUES
('Super Admin', 'Admin', 'admin@feuerwehr-challenge.de', 
'$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 
'super_admin', 0);
`;

const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

db.serialize(() => {
    statements.forEach(statement => {
        db.run(statement + ';', (err) => {
            if (err) {
                console.error('Error executing statement:', err.message);
            }
        });
    });
});

db.close((err) => {
    if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
    }
    console.log('Database reset successfully');
    console.log('Only NRW districts and Admin user created');
    console.log('You can now:');
    console.log('1. Login as admin');
    console.log('2. Create cities/stations');
    console.log('3. Zugführer can register');
});
