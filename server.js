require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');
const { run, query } = require('./models/db');
const Season = require('./models/Season');
const PushService = require('./models/PushService');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration - 30 Tage gültig (bleibt angemeldet)
app.use(session({
    secret: process.env.SESSION_SECRET || 'feuerwehr-challenge-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Nicht-Production: kein HTTPS nötig
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 Tage
    }
}));

// Flash messages
app.use(flash());

// Global middleware for flash messages and user
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// ============ INITIALISIERUNG ============
// Schema-Erweiterungen für Cooldown und Season-System
async function initializeSystem() {
    try {
        // Erweiterte Tabellen anlegen
        await run(`CREATE TABLE IF NOT EXISTS seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date DATETIME NOT NULL,
            end_date DATETIME NOT NULL,
            active BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        await run(`CREATE TABLE IF NOT EXISTS user_challenge_cooldown (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            challenge_id INTEGER NOT NULL,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            cooldown_until DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
            UNIQUE(user_id, challenge_id)
        )`);
        
        await run(`CREATE TABLE IF NOT EXISTS season_points_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            season_id INTEGER NOT NULL,
            points_earned INTEGER DEFAULT 0,
            rank_position INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
            UNIQUE(user_id, season_id)
        )`);
        
        await run(`CREATE TABLE IF NOT EXISTS station_season_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station_id INTEGER NOT NULL,
            season_id INTEGER NOT NULL,
            total_points INTEGER DEFAULT 0,
            member_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
            FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
            UNIQUE(station_id, season_id)
        )`);
        
        await run(`CREATE TABLE IF NOT EXISTS daily_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            active_date DATE NOT NULL,
            multiplier INTEGER DEFAULT 2,
            active BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
            UNIQUE(active_date)
        )`);
        
        // PushSubscriptions Tabelle initialisieren
        await PushService.initTable();
        console.log('✅ Push-Subscriptions Tabelle initialisiert');
        
        console.log('✅ Schema-Erweiterungen initialisiert');
        
        // Aktive Season prüfen/erstellen
        const season = await Season.getActive();
        if (season) {
            console.log(`📅 Aktive Saison: ${season.name} (${season.start_date} bis ${season.end_date})`);
        }
    } catch (error) {
        console.error('❌ Fehler bei Schema-Initialisierung:', error.message);
    }
}

// System initialisieren
initializeSystem();

// ============ ROUTES ============
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const challengeRoutes = require('./routes/challenges');
const rankingRoutes = require('./routes/rankings');
const adminRoutes = require('./routes/admin');
const leitstelleRoutes = require('./routes/leitstelle');
const apiRoutes = require('./routes/api');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/challenges', challengeRoutes);
app.use('/daily-challenge', require('./routes/daily'));
app.use('/rankings', rankingRoutes);
app.use('/admin', adminRoutes);
app.use('/leitstelle', leitstelleRoutes);
app.use('/api', apiRoutes);

// Home route
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'leitstelle') {
            return res.redirect('/leitstelle');
        }
        return res.redirect('/dashboard');
    }
    res.render('landing', { title: 'Feuerwehr-Challenge NRW' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        title: 'Fehler', 
        message: 'Ein Fehler ist aufgetreten',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        title: 'Seite nicht gefunden', 
        message: 'Die angeforderte Seite wurde nicht gefunden',
        error: {}
    });
});

app.listen(PORT, () => {
    console.log(`Feuerwehr-Challenge NRW läuft auf Port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});

module.exports = app;
