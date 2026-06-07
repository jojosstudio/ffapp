const { run, query } = require('../models/db');

async function migrate() {
    try {
        const columns = await query('PRAGMA table_info(users)');
        const columnNames = columns.map(c => c.name);

        if (columnNames.includes('city_id')) {
            console.log('✅ Leitstelle migration already applied');
            process.exit(0);
            return;
        }

        const users = await query('SELECT * FROM users');
        console.log(`Backing up ${users.length} users...`);

        await run('DROP TABLE IF EXISTS users_new');
        await run(`
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                station_id INTEGER,
                city_id INTEGER,
                realname TEXT NOT NULL,
                nickname TEXT NOT NULL UNIQUE,
                email TEXT UNIQUE,
                password_hash TEXT,
                role TEXT CHECK(role IN ('super_admin', 'zugfuehrer', 'leitstelle', 'ff', 'jf')) DEFAULT 'ff',
                points INTEGER DEFAULT 0,
                active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                phone TEXT,
                dienstgrad TEXT,
                dienstjahre INTEGER DEFAULT 0,
                geburtsdatum TEXT,
                plz TEXT,
                FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
                FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL
            )
        `);

        for (const u of users) {
            await run(
                `INSERT INTO users_new (id, station_id, city_id, realname, nickname, email, password_hash, role, points, active, created_at, last_login, phone, dienstgrad, dienstjahre, geburtsdatum, plz)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    u.id, u.station_id, u.city_id || null, u.realname, u.nickname, u.email,
                    u.password_hash, u.role, u.points || 0, u.active !== 0 && u.active !== false ? 1 : 0,
                    u.created_at, u.last_login, u.phone || null, u.dienstgrad || null,
                    u.dienstjahre || 0, u.geburtsdatum || null, u.plz || null
                ]
            );
        }

        await run('DROP TABLE users');
        await run('ALTER TABLE users_new RENAME TO users');
        console.log('✅ Leitstelle migration completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
