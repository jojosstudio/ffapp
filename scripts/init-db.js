const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './database.sqlite';

const initDatabase = () => {
    const dbPath = path.resolve(DB_PATH);
    
    // Remove existing database if it exists
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Existing database removed');
    }
    
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error creating database:', err.message);
            return;
        }
        console.log('Connected to SQLite database');
    });
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split schema into individual statements
    const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    db.serialize(() => {
        statements.forEach(statement => {
            db.run(statement + ';', (err) => {
                if (err) {
                    console.error('Error executing statement:', err.message);
                    console.error('Statement:', statement.substring(0, 100) + '...');
                }
            });
        });
    });
    
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database initialized successfully at:', dbPath);
        }
    });
};

initDatabase();
