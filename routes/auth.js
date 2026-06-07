const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Station = require('../models/Station');

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'leitstelle') {
            return res.redirect('/leitstelle');
        }
        return res.redirect('/dashboard');
    }
    const states = Station.getStates().then(states => {
        res.render('auth/login', { title: 'Anmelden', states });
    }).catch(() => {
        res.render('auth/login', { title: 'Anmelden', states: [] });
    });
});

// Login POST - supports email OR nickname
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Try email first, then nickname
        let user = await User.findByEmail(email);
        if (!user) {
            user = await User.findByNickname(email);
        }
        
        if (!user) {
            req.flash('error', 'Ungültige E-Mail/Benutzername oder Passwort');
            return res.redirect('/login');
        }
        
        const validPassword = await User.verifyPassword(user, password);
        
        if (!validPassword) {
            req.flash('error', 'Ungültige E-Mail/Benutzername oder Passwort');
            return res.redirect('/login');
        }
        
        await User.updateLastLogin(user.id);
        
        const { password_hash, ...userWithoutPassword } = user;
        req.session.user = userWithoutPassword;
        
        req.flash('success', `Willkommen zurück, ${user.nickname}!`);
        if (user.role === 'leitstelle') {
            return res.redirect('/leitstelle');
        }
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'Ein Fehler ist aufgetreten');
        res.redirect('/login');
    }
});

// Register page
router.get('/register', async (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    
    try {
        const states = await Station.getNrwStructure();
        const stations = await Station.findAll(true, true);
        res.render('auth/register', { 
            title: 'Als Zugführer registrieren',
            states,
            stations,
            isZugfuehrerOnly: true
        });
    } catch (error) {
        console.error('Register page error:', error);
        res.render('auth/register', { 
            title: 'Als Zugführer registrieren',
            districts: [],
            stations: [],
            isZugfuehrerOnly: true,
            error: 'Fehler beim Laden der Daten'
        });
    }
});

// Register POST
router.post('/register', async (req, res) => {
    const { realname, nickname, email, password, password_confirm, station_id, vorname, nachname, phone, dienstgrad, dienstjahre, geburtsdatum } = req.body;
    
    const fullName = realname || ((vorname || '') + ' ' + (nachname || '')).trim();
    
    if (!fullName || !nickname || !email || !password || !station_id) {
        req.flash('error', 'Bitte fülle alle Pflichtfelder aus (inkl. Löschzug)');
        return res.redirect('/register');
    }
    
    if (password !== password_confirm) {
        req.flash('error', 'Die Passwörter stimmen nicht überein');
        return res.redirect('/register');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Das Passwort muss mindestens 6 Zeichen lang sein');
        return res.redirect('/register');
    }
    
    try {
        const existingZugfuehrer = await User.findByStation(station_id);
        const hasZugfuehrer = existingZugfuehrer.some(u => u.role === 'zugfuehrer');
        
        if (hasZugfuehrer) {
            req.flash('error', 'Dieser Löschzug hat bereits einen Zugführer.');
            return res.redirect('/register');
        }
        
        const existingNickname = await User.findByNickname(nickname);
        if (existingNickname) {
            req.flash('error', 'Dieser Nickname ist bereits vergeben');
            return res.redirect('/register');
        }
        
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            req.flash('error', 'Diese E-Mail ist bereits registriert');
            return res.redirect('/register');
        }
        
        const userId = await User.create({
            realname: fullName,
            nickname,
            email,
            password,
            role: 'zugfuehrer',
            station_id: parseInt(station_id),
            phone: phone || null,
            dienstgrad: dienstgrad || null,
            dienstjahre: dienstjahre ? parseInt(dienstjahre) : 0,
            geburtsdatum: geburtsdatum || null
        });
        
        req.flash('success', 'Registrierung erfolgreich! Du kannst dich jetzt anmelden.');
        res.redirect('/login');
    } catch (error) {
        console.error('Register error:', error);
        req.flash('error', 'Ein Fehler ist bei der Registrierung aufgetreten');
        res.redirect('/register');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// Profile page
router.get('/profile', async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Bitte melde dich zuerst an');
        return res.redirect('/login');
    }
    
    try {
        const user = await User.findById(req.session.user.id);
        const states = await Station.getNrwStructure(true);
        const stationApplications = await Station.getUserStationApplications(user.id, user.email);
        
        // Get season history for this user
        const db = require('../models/db');
        const seasonHistory = await db.query(`
            SELECT sph.*, s.name as season_name, s.start_date, s.end_date
            FROM season_points_history sph
            JOIN seasons s ON sph.season_id = s.id
            WHERE sph.user_id = ?
            ORDER BY s.start_date DESC
        `, [user.id]);
        
        // Calculate total all-time points
        const totalAllTime = seasonHistory.reduce((sum, sh) => sum + (sh.points_earned || 0), 0);
        
        // Also get all submissions points for complete history
        const submissionTotal = await db.get(`
            SELECT COALESCE(SUM(points_awarded), 0) as total
            FROM submissions
            WHERE user_id = ? AND status = 'approved'
        `, [user.id]);
        
        const grandTotal = Math.max(submissionTotal.total, totalAllTime);

        res.render('auth/profile', {
            title: 'Profil',
            user,
            states,
            stationApplications,
            seasonHistory,
            totalAllTime: grandTotal
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error', 'Fehler beim Laden des Profils');
        res.redirect('/dashboard');
    }
});

// Update profile
router.post('/profile', async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Bitte melde dich zuerst an');
        return res.redirect('/login');
    }
    
    const { realname, nickname, email, station_id, current_password, new_password } = req.body;
    
    try {
        const user = await User.findById(req.session.user.id);
        
        if (new_password) {
            if (!current_password) {
                req.flash('error', 'Bitte gib dein aktuelles Passwort ein');
                return res.redirect('/profile');
            }
            
            const validPassword = await User.verifyPassword(user, current_password);
            if (!validPassword) {
                req.flash('error', 'Aktuelles Passwort ist falsch');
                return res.redirect('/profile');
            }
        }
        
        if (nickname !== user.nickname) {
            const existingNickname = await User.findByNickname(nickname);
            if (existingNickname) {
                req.flash('error', 'Dieser Nickname ist bereits vergeben');
                return res.redirect('/profile');
            }
        }
        
        const updateData = { realname, nickname, email, station_id: station_id || null };
        
        if (new_password) {
            updateData.password = new_password;
        }
        
        await User.update(req.session.user.id, updateData);
        
        const updatedUser = await User.findById(req.session.user.id);
        const { password_hash, ...userWithoutPassword } = updatedUser;
        req.session.user = userWithoutPassword;
        
        req.flash('success', 'Profil erfolgreich aktualisiert');
        res.redirect('/profile');
    } catch (error) {
        console.error('Profile update error:', error);
        req.flash('error', 'Fehler beim Aktualisieren des Profils');
        res.redirect('/profile');
    }
});

// Invitation acceptance page
router.get('/einladung/:token', async (req, res) => {
    try {
        const db = require('../models/db');
        const token = req.params.token;
        
        // First find the invitation by token
        const invitation = await db.get(
            'SELECT * FROM invitations WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime("now")) AND status = ?',
            [token, 'pending']
        );
        
        if (!invitation) {
            req.flash('error', 'Ungültiger oder abgelaufener Einladungslink');
            return res.redirect('/login');
        }
        
        // Find the user associated with this invitation
        const user = await db.get(
            'SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name FROM users u LEFT JOIN stations s ON u.station_id = s.id LEFT JOIN cities c ON s.city_id = c.id WHERE u.station_id = ? AND u.active = 0 AND u.email LIKE ?',
            [invitation.station_id, `%@einladung.${token.substring(0, 8)}.fw`]
        );
        
        if (!user) {
            req.flash('error', 'Benutzer nicht gefunden');
            return res.redirect('/login');
        }
        
        // Combine invitation and user data
        const invitationData = {
            ...invitation,
            ...user,
            user_id: user.id
        };
        
        res.render('auth/invitation', {
            title: 'Einladung annehmen',
            invitation: invitationData,
            token: token
        });
    } catch (error) {
        console.error('Invitation error:', error);
        req.flash('error', 'Fehler beim Laden der Einladung');
        res.redirect('/login');
    }
});

// Accept invitation - set email and password
router.post('/einladung/:token', async (req, res) => {
    const { email, password, password_confirm } = req.body;
    
    if (!email || !password) {
        req.flash('error', 'Bitte fülle alle Felder aus');
        return res.redirect(`/einladung/${req.params.token}`);
    }
    
    if (password !== password_confirm) {
        req.flash('error', 'Die Passwörter stimmen nicht überein');
        return res.redirect(`/einladung/${req.params.token}`);
    }
    
    if (password.length < 6) {
        req.flash('error', 'Passwort muss mindestens 6 Zeichen lang sein');
        return res.redirect(`/einladung/${req.params.token}`);
    }
    
    try {
        const db = require('../models/db');
        const bcrypt = require('bcryptjs');
        
        const invitation = await db.get(
            'SELECT * FROM invitations WHERE token = ? AND expires_at > datetime("now")',
            [req.params.token]
        );
        
        if (!invitation) {
            req.flash('error', 'Ungültiger oder abgelaufener Einladungslink');
            return res.redirect('/login');
        }
        
        // Find user by generated email pattern
        const user = await db.get(
            "SELECT * FROM users WHERE email LIKE ? AND active = 0",
            [`%@einladung.${invitation.token.substring(0, 8)}.fw`]
        );
        
        if (!user) {
            req.flash('error', 'Benutzer nicht gefunden');
            return res.redirect('/login');
        }
        
        // Check if email already exists
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            req.flash('error', 'Diese E-Mail wird bereits verwendet');
            return res.redirect(`/einladung/${req.params.token}`);
        }
        
        // Update user: set email, password, activate
        const passwordHash = await bcrypt.hash(password, 10);
        await db.run(
            'UPDATE users SET email = ?, password_hash = ?, active = 1 WHERE id = ?',
            [email, passwordHash, user.id]
        );
        
        // Mark invitation as used
        await db.run(
            'UPDATE invitations SET status = ?, used = 1, responded_at = datetime("now") WHERE id = ?',
            ['accepted', invitation.id]
        );
        
        req.flash('success', 'Account aktiviert! Du kannst dich jetzt anmelden.');
        res.redirect('/login');
    } catch (error) {
        console.error('Accept invitation error:', error);
        req.flash('error', 'Fehler bei der Aktivierung');
        res.redirect(`/einladung/${req.params.token}`);
    }
});

// Password reset page (GET)
router.get('/password-reset/:token', async (req, res) => {
    try {
        const db = require('../models/db');
        const token = req.params.token;
        
        // Find valid reset token
        const resetToken = await db.get(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND (expires_at IS NULL OR expires_at > datetime("now"))',
            [token]
        );
        
        if (!resetToken) {
            req.flash('error', 'Ungültiger oder abgelaufener Reset-Link');
            return res.redirect('/login');
        }
        
        // Find user
        const user = await db.get('SELECT id, realname, nickname, email FROM users WHERE id = ?', [resetToken.user_id]);
        
        if (!user) {
            req.flash('error', 'Benutzer nicht gefunden');
            return res.redirect('/login');
        }
        
        res.render('auth/password-reset', {
            title: 'Passwort zurücksetzen',
            user,
            token
        });
    } catch (error) {
        console.error('Password reset page error:', error);
        req.flash('error', 'Fehler beim Laden der Seite');
        res.redirect('/login');
    }
});

// Password reset (POST)
router.post('/password-reset/:token', async (req, res) => {
    const { password, password_confirm } = req.body;
    
    if (!password || !password_confirm) {
        req.flash('error', 'Bitte fülle alle Felder aus');
        return res.redirect(`/password-reset/${req.params.token}`);
    }
    
    if (password !== password_confirm) {
        req.flash('error', 'Die Passwörter stimmen nicht überein');
        return res.redirect(`/password-reset/${req.params.token}`);
    }
    
    if (password.length < 6) {
        req.flash('error', 'Passwort muss mindestens 6 Zeichen lang sein');
        return res.redirect(`/password-reset/${req.params.token}`);
    }
    
    try {
        const db = require('../models/db');
        const bcrypt = require('bcryptjs');
        const token = req.params.token;
        
        // Find valid reset token
        const resetToken = await db.get(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND (expires_at IS NULL OR expires_at > datetime("now"))',
            [token]
        );
        
        if (!resetToken) {
            req.flash('error', 'Ungültiger oder abgelaufener Reset-Link');
            return res.redirect('/login');
        }
        
        // Update user password
        const passwordHash = await bcrypt.hash(password, 10);
        await db.run(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [passwordHash, resetToken.user_id]
        );
        
        // Mark token as used
        await db.run('UPDATE password_resets SET used = TRUE WHERE id = ?', [resetToken.id]);
        
        req.flash('success', 'Passwort erfolgreich zurückgesetzt! Du kannst dich jetzt anmelden.');
        res.redirect('/login');
    } catch (error) {
        console.error('Password reset error:', error);
        req.flash('error', 'Fehler beim Zurücksetzen des Passworts');
        res.redirect(`/password-reset/${req.params.token}`);
    }
});

// Deactivate account
router.post('/profile/deactivate', async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Bitte melde dich zuerst an');
        return res.redirect('/login');
    }
    
    try {
        await User.delete(req.session.user.id);
        req.session.destroy((err) => {
            if (err) console.error('Session destroy error:', err);
        });
        req.flash('success', 'Dein Account wurde deaktiviert');
        res.redirect('/');
    } catch (error) {
        console.error('Deactivate account error:', error);
        req.flash('error', 'Fehler beim Deaktivieren des Accounts');
        res.redirect('/profile');
    }
});

module.exports = router;
