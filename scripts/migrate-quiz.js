const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './database.sqlite';
const db = new sqlite3.Database(path.resolve(DB_PATH));

db.serialize(() => {
    // Check if new columns exist
    db.all('PRAGMA table_info(quiz_questions)', [], (err, columns) => {
        if (err) {
            console.error('Error:', err);
            process.exit(1);
        }
        
        const hasNewSchema = columns.some(c => c.name === 'option_a');
        
        if (hasNewSchema) {
            console.log('✅ Schema already up to date');
            process.exit(0);
        }
        
        console.log('🔄 Migrating quiz_questions table...');
        
        // Backup old data
        db.all('SELECT * FROM quiz_questions', [], (err, rows) => {
            if (err) {
                console.error('Error backing up:', err);
                process.exit(1);
            }
            
            // Drop old table
            db.run('DROP TABLE IF EXISTS quiz_questions', (err) => {
                if (err) {
                    console.error('Error dropping table:', err);
                    process.exit(1);
                }
                
                // Create new table
                db.run(`
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
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating table:', err);
                        process.exit(1);
                    }
                    
                    // Restore data if any
                    if (rows && rows.length > 0) {
                        const stmt = db.prepare(`
                            INSERT INTO quiz_questions (challenge_id, question, option_a, option_b, option_c, option_d, correct_answer)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        rows.forEach(row => {
                            let options = [];
                            try {
                                options = JSON.parse(row.options);
                            } catch (e) {
                                options = [];
                            }
                            
                            stmt.run(
                                row.challenge_id,
                                row.question,
                                options[0] || '',
                                options[1] || '',
                                options[2] || '',
                                options[3] || '',
                                row.correct_answer || 0
                            );
                        });
                        
                        stmt.finalize(() => {
                            console.log('✅ Migration complete');
                            process.exit(0);
                        });
                    } else {
                        console.log('✅ Migration complete (no data to restore)');
                        process.exit(0);
                    }
                });
            });
        });
    });
});
