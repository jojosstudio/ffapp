-- Feuerwehr-Challenge NRW - Database Schema
-- SQLite compatible

-- Bundesländer (only NRW in this version)
CREATE TABLE IF NOT EXISTS states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Deutschland',
    UNIQUE(name, country)
);

-- Städte/Kreise (Cities/Counties)
CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('kreis', 'kreisfreie_stadt')) DEFAULT 'kreis',
    FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE,
    UNIQUE(state_id, name)
);

-- Löschzüge/Feuerwehrstationen (Fire Stations)
CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    lz_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    UNIQUE(city_id, lz_number)
);

-- Benutzer (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER,
    realname TEXT NOT NULL,
    nickname TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT CHECK(role IN ('super_admin', 'zugfuehrer', 'leitstelle', 'ff', 'jf')) DEFAULT 'ff',
    points INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    city_id INTEGER,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL
);

-- Challenges (Aufgaben)
CREATE TABLE IF NOT EXISTS challenges (
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

-- Quiz-Fragen für Theorie-Challenges
CREATE TABLE IF NOT EXISTS quiz_questions (
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

-- Einreichungen/Submissions
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    answer_data TEXT, -- JSON: quiz answers or practice submission details
    proof_image TEXT, -- Path to uploaded image for practice challenges
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    points_awarded INTEGER DEFAULT 0,
    feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Einladungen (Invitations for station members)
CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL,
    email TEXT,
    token TEXT NOT NULL UNIQUE,
    role TEXT CHECK(role IN ('zugfuehrer', 'ff', 'jf')) DEFAULT 'ff',
    used BOOLEAN DEFAULT FALSE,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected', 'revoked')) DEFAULT 'pending',
    responded_at DATETIME,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Passwort-Reset-Tokens
CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    used BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Initial Data: Deutschland > Nordrhein-Westfalen
INSERT OR IGNORE INTO states (name, country) VALUES ('Nordrhein-Westfalen', 'Deutschland');

-- Städte/Kreise in NRW
INSERT OR IGNORE INTO cities (state_id, name, type) VALUES
-- Regierungsbezirk Düsseldorf
(1, 'Düsseldorf', 'kreisfreie_stadt'),
(1, 'Duisburg', 'kreisfreie_stadt'),
(1, 'Essen', 'kreisfreie_stadt'),
(1, 'Krefeld', 'kreisfreie_stadt'),
(1, 'Oberhausen', 'kreisfreie_stadt'),
(1, 'Remscheid', 'kreisfreie_stadt'),
(1, 'Solingen', 'kreisfreie_stadt'),
(1, 'Wuppertal', 'kreisfreie_stadt'),
(1, 'Kreis Mettmann', 'kreis'),
(1, 'Kreis Rhein-Kreis Neuss', 'kreis'),
(1, 'Kreis Viersen', 'kreis'),
(1, 'Kreis Wesel', 'kreis'),
-- Regierungsbezirk Köln
(1, 'Aachen', 'kreisfreie_stadt'),
(1, 'Bonn', 'kreisfreie_stadt'),
(1, 'Köln', 'kreisfreie_stadt'),
(1, 'Leverkusen', 'kreisfreie_stadt'),
(1, 'Kreis Düren', 'kreis'),
(1, 'Kreis Euskirchen', 'kreis'),
(1, 'Kreis Heinsberg', 'kreis'),
(1, 'Oberbergischer Kreis', 'kreis'),
(1, 'Rheinisch-Bergischer Kreis', 'kreis'),
(1, 'Rhein-Erft-Kreis', 'kreis'),
(1, 'Rhein-Sieg-Kreis', 'kreis'),
-- Regierungsbezirk Münster
(1, 'Bottrop', 'kreisfreie_stadt'),
(1, 'Gelsenkirchen', 'kreisfreie_stadt'),
(1, 'Münster', 'kreisfreie_stadt'),
(1, 'Kreis Borken', 'kreis'),
(1, 'Kreis Coesfeld', 'kreis'),
(1, 'Kreis Recklinghausen', 'kreis'),
(1, 'Kreis Steinfurt', 'kreis'),
(1, 'Kreis Warendorf', 'kreis'),
-- Regierungsbezirk Arnsberg
(1, 'Bochum', 'kreisfreie_stadt'),
(1, 'Dortmund', 'kreisfreie_stadt'),
(1, 'Hagen', 'kreisfreie_stadt'),
(1, 'Hamm', 'kreisfreie_stadt'),
(1, 'Herne', 'kreisfreie_stadt'),
(1, 'Iserlohn', 'kreisfreie_stadt'),
(1, 'Kreis Ennepe-Ruhr-Kreis', 'kreis'),
(1, 'Kreis Hochsauerlandkreis', 'kreis'),
(1, 'Kreis Märkischer Kreis', 'kreis'),
(1, 'Kreis Olpe', 'kreis'),
(1, 'Kreis Siegen-Wittgenstein', 'kreis'),
(1, 'Kreis Soest', 'kreis'),
(1, 'Kreis Unna', 'kreis'),
-- Regierungsbezirk Detmold
(1, 'Bielefeld', 'kreisfreie_stadt'),
(1, 'Kreis Gütersloh', 'kreis'),
(1, 'Kreis Herford', 'kreis'),
(1, 'Kreis Höxter', 'kreis'),
(1, 'Kreis Lippe', 'kreis'),
(1, 'Kreis Minden-Lübbecke', 'kreis'),
(1, 'Kreis Paderborn', 'kreis');

-- Super-Admin User (Password: admin123 - change in production!)
INSERT OR IGNORE INTO users (realname, nickname, email, password_hash, role, points) VALUES
('Super Admin', 'Admin', 'admin@feuerwehr-challenge.de', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'super_admin', 0);