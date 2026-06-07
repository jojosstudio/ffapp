const { run, query } = require('../models/db');
(async () => {
  try {
    // Backup existing users
    const users = await query('SELECT * FROM users');
    console.log('Backing up', users.length, 'users');

    // Drop and recreate users table with proper CHECK constraint
    await run('DROP TABLE IF EXISTS users');
    await run(
      'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, station_id INTEGER, realname TEXT NOT NULL, nickname TEXT NOT NULL UNIQUE, email TEXT UNIQUE, password_hash TEXT, role TEXT CHECK(role IN (\'super_admin\',\'zugfuehrer\',\'ff\',\'jf\')) DEFAULT \'ff\', points INTEGER DEFAULT 0, active BOOLEAN DEFAULT TRUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login DATETIME, phone TEXT, dienstgrad TEXT, dienstjahre INTEGER DEFAULT 0, geburtsdatum TEXT, plz TEXT, FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL)'
    );
    console.log('Recreated users table');

    // Re-insert users
    for (const u of users) {
      await run(
        'INSERT INTO users (id, station_id, realname, nickname, email, password_hash, role, points, active, created_at, last_login, phone, dienstgrad, dienstjahre, geburtsdatum, plz) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [u.id, u.station_id, u.realname, u.nickname, u.email, u.password_hash, u.role, u.points || 0, u.active !== false ? 1 : 0, u.created_at, u.last_login, u.phone || null, u.dienstgrad || null, u.dienstjahre || 0, u.geburtsdatum || null, u.plz || null]
      );
    }
    console.log('Restored', users.length, 'users');
    console.log('Done!');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();