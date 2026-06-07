const express = require('express');
const router = express.Router();
const { requireSuperAdmin, requireZugfuehrer, requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const Station = require('../models/Station');
const Submission = require('../models/Submission');
const Challenge = require('../models/Challenge');
const Season = require('../models/Season');
const crypto = require('crypto');

// Super Admin: Dashboard
router.get('/super', requireSuperAdmin, async (req, res) => {
    try {
        const unverifiedStations = await Station.findAll(false);
        const { query } = require('../models/db');
const allUsers = await query(`
    SELECT u.*, s.name as station_name, s.lz_number, c.name as city_name,
           lc.name as assigned_city_name
    FROM users u
    LEFT JOIN stations s ON u.station_id = s.id
    LEFT JOIN cities c ON s.city_id = c.id
    LEFT JOIN cities lc ON u.city_id = lc.id
    ORDER BY u.active DESC, u.realname ASC
`);

        const allStations = await Station.findAll();
        const states = await Station.getNrwStructure();
        const pendingSubmissions = await Submission.findAll({ status: 'pending' });

        const totalPoints = allUsers.reduce((sum, u) => sum + (u.points || 0), 0);
        const usersWithoutStation = allUsers.filter(u => !u.station_id && u.role !== 'super_admin').length;
        
        res.render('admin/super-dashboard', {
            title: 'Super Admin Dashboard',
            unverifiedStations,
            allUsers: Array.isArray(allUsers) ? allUsers : [],
            allStations,
            allCities: states.flatMap(s => s.cities || []),
            states,
            totalUsers: allUsers.length,
            totalStations: allStations.length,
            totalPoints,
            usersWithoutStation,
            pendingSubmissions,
        });
    } catch (error) {
        console.error('Super admin error:', error);
        req.flash('error', 'Fehler beim Laden der Daten');
        res.redirect('/dashboard');
    }
});

router.post('/verify-station/:id', requireSuperAdmin, async (req, res) => {
    try {
        await Station.verify(req.params.id);
        req.flash('success', 'LÃ¶schzug erfolgreich verifiziert');
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Verify station error:', error);
        req.flash('error', 'Fehler bei der Verifizierung');
        res.redirect('/admin/super');
    }
});

router.post('/create-city', requireSuperAdmin, async (req, res) => {
    const { state_id, name, type } = req.body;
    try {
        const db = require('../models/db');
        await db.run('INSERT INTO cities (state_id, name, type) VALUES (?, ?, ?)', [parseInt(state_id), name, type]);
        req.flash('success', `Stadt/Kreis "${name}" erfolgreich erstellt`);
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Create city error:', error);
        req.flash('error', 'Fehler beim Erstellen der Stadt/des Kreises');
        res.redirect('/admin/super');
    }
});

router.post('/create-station', requireSuperAdmin, async (req, res) => {
    const { city_id, lz_number, name, verified } = req.body;
    try {
        const db = require('../models/db');
        await db.run('INSERT INTO stations (city_id, lz_number, name, verified) VALUES (?, ?, ?, ?)',
            [parseInt(city_id), parseInt(lz_number), name, verified ? 1 : 0]);
        req.flash('success', `LÃ¶schzug LZ ${lz_number} ${name} erfolgreich erstellt`);
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Create station error:', error);
        req.flash('error', 'Fehler beim Erstellen des LÃ¶schzugs: ' + error.message);
        res.redirect('/admin/super');
    }
});

router.post('/change-role/:id', requireSuperAdmin, async (req, res) => {
    const { role } = req.body;
    try {
        await User.update(req.params.id, { role });
        req.flash('success', 'Rolle erfolgreich aktualisiert');
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Change role error:', error);
        req.flash('error', 'Fehler beim Aktualisieren der Rolle');
        res.redirect('/admin/super');
    }
});

router.post('/update-user/:id', requireSuperAdmin, async (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    const { realname, nickname, email, role, points, station_id, city_id } = req.body;

    try {
        const targetUser = await User.findByIdAdmin(targetId);
        if (!targetUser) {
            req.flash('error', 'Nutzer nicht gefunden');
            return res.redirect('/admin/super');
        }

        if (targetUser.role === 'super_admin' && targetId !== req.session.user.id) {
            req.flash('error', 'Super-Admins kÃ¶nnen nur von sich selbst bearbeitet werden');
            return res.redirect('/admin/super');
        }

        if (nickname && nickname !== targetUser.nickname) {
            const existing = await User.findByNickname(nickname);
            if (existing && existing.id !== targetId) {
                req.flash('error', 'Dieser Nickname ist bereits vergeben');
                return res.redirect('/admin/super');
            }
        }

        if (email && email !== targetUser.email) {
            const existing = await User.findByEmail(email);
            if (existing && existing.id !== targetId) {
                req.flash('error', 'Diese E-Mail ist bereits vergeben');
                return res.redirect('/admin/super');
            }
        }

        const selectedRole = role || targetUser.role;
        const parsedStationId = station_id === '' || station_id === 'null' ? null : parseInt(station_id, 10);
        const parsedCityId = city_id === '' || city_id === 'null' ? null : parseInt(city_id, 10);

        if (selectedRole === 'leitstelle' && !parsedCityId) {
            req.flash('error', 'FÃ¼r Leitstelle-Nutzer muss eine Stadt zugewiesen werden');
            return res.redirect('/admin/super');
        }

        const updateData = {
            realname: realname?.trim() || targetUser.realname,
            nickname: nickname?.trim() || targetUser.nickname,
            email: email?.trim() || targetUser.email,
        };

        if (targetUser.role !== 'super_admin') {
            updateData.role = selectedRole;
        }

        if (selectedRole === 'leitstelle') {
            updateData.city_id = parsedCityId;
            updateData.station_id = null;
            updateData.points = 0;
        } else if (targetUser.role !== 'super_admin') {
            updateData.points = Math.max(0, parseInt(points, 10) || 0);
            updateData.station_id = parsedStationId;
            updateData.city_id = null;
        } else if (targetId === req.session.user.id) {
            updateData.points = Math.max(0, parseInt(points, 10) || 0);
        }

        await User.update(targetId, updateData);

        if (targetId === req.session.user.id) {
            const updated = await User.findById(targetId);
            if (updated) {
                const { password_hash, ...userWithoutPassword } = updated;
                req.session.user = userWithoutPassword;
            }
        }

        req.flash('success', `${updateData.realname} wurde erfolgreich aktualisiert`);
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Update user error:', error);
        req.flash('error', 'Fehler beim Aktualisieren des Nutzers');
        res.redirect('/admin/super');
    }
});

router.post('/deactivate-user/:id', requireSuperAdmin, async (req, res) => {
    const targetId = parseInt(req.params.id, 10);

    try {
        if (targetId === req.session.user.id) {
            req.flash('error', 'Du kannst deinen eigenen Account nicht deaktivieren');
            return res.redirect('/admin/super');
        }

        const targetUser = await User.findByIdAdmin(targetId);
        if (!targetUser) {
            req.flash('error', 'Nutzer nicht gefunden');
            return res.redirect('/admin/super');
        }

        if (targetUser.role === 'super_admin') {
            req.flash('error', 'Super-Admins kÃ¶nnen nicht deaktiviert werden');
            return res.redirect('/admin/super');
        }

        await User.delete(targetId);
        req.flash('success', `${targetUser.realname} wurde deaktiviert`);
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Deactivate user error:', error);
        req.flash('error', 'Fehler beim Deaktivieren des Nutzers');
        res.redirect('/admin/super');
    }
});

// ZugfÃ¼hrer: Station Management
router.get('/station', requireZugfuehrer, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user.station_id && user.role !== 'super_admin') {
            req.flash('error', 'Du hast keinen LÃ¶schzug zugewiesen');
            return res.redirect('/dashboard');
        }
        const station = await Station.findById(user.station_id);
        const members = await User.findByStation(user.station_id);
        const pendingSubmissions = await Submission.getPendingForStation(user.station_id);
        const pendingInvitations = await Station.getPendingInvitations(user.station_id);
        
        // Format invitations for display
        const formattedInvitations = pendingInvitations.map(inv => ({
            id: inv.id,
            email: inv.email,
            realname: inv.realname || 'N/A',
            nickname: inv.nickname || 'N/A',
            applicant_realname: inv.applicant_realname,
            applicant_nickname: inv.applicant_nickname,
            role: inv.role,
            token: inv.token,
            created_at: inv.created_at,
            expires_at: inv.expires_at,
            invite_link: `${req.protocol}://${req.get('host')}/einladung/${inv.token}`,
            created_by: inv.created_by_name
        }));
        
        const totalPoints = members.reduce((sum, m) => sum + (m.points || 0), 0);
        const activeMembers = members.filter(m => m.active);

        res.render('admin/station-dashboard', {
            title: 'LÃ¶schzug Verwaltung',
            station,
            members: activeMembers,
            totalPoints,
            pendingSubmissions,
            pendingInvitations: formattedInvitations,
            user
        });
    } catch (error) {
        console.error('Station admin error:', error);
        req.flash('error', 'Fehler beim Laden der Daten');
        res.redirect('/dashboard');
    }
});

// GENERATE INVITATION - creates user account with token
router.post('/generate-invitation', requireZugfuehrer, async (req, res) => {
    const { nickname, realname, role } = req.body;
    const user = req.session.user;
    
    try {
        if (!nickname || !realname || !role) {
            req.flash('error', 'Bitte fÃ¼lle alle Felder aus');
            return res.redirect('/admin/station');
        }
        
        // Check if nickname exists
        const existing = await User.findByNickname(nickname);
        if (existing) {
            req.flash('error', 'Nickname bereits vergeben');
            return res.redirect('/admin/station');
        }
        
        // Generate invite token
        const token = crypto.randomBytes(32).toString('hex');
        const db = require('../models/db');
        
        // Create user with token, no password yet
        const result = await db.run(
            'INSERT INTO users (realname, nickname, email, password_hash, role, station_id, active) VALUES (?, ?, ?, ?, ?, ?, 0)',
            [realname, nickname, nickname + '@einladung.' + token.substring(0, 8) + '.fw', null, role, user.station_id]
        );
        
        // Store invite token in invitations table
        await db.run(
            'INSERT OR IGNORE INTO invitations (station_id, email, token, role, created_by, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now", "+30 days"))',
            [user.station_id, nickname + '@einladung.' + token.substring(0, 8) + '.fw', token, role, user.id, 'pending']
        );
        
        const inviteLink = `${req.protocol}://${req.get('host')}/einladung/${token}`;
        
        req.flash('success', 'Einladung erstellt!');
        req.flash('invite_link', inviteLink);
        req.flash('invite_nickname', nickname);
        req.flash('invite_realname', realname);
        req.flash('invite_role', role);
        req.flash('invite_password', token.substring(0, 12));
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Generate invitation error:', error);
        req.flash('error', 'Fehler beim Erstellen der Einladung');
        res.redirect('/admin/station');
    }
});

// Review submission
router.post('/review-submission/:id', requireZugfuehrer, async (req, res) => {
    const { action, points, feedback } = req.body;
    const submissionId = req.params.id;
    try {
        const submission = await Submission.findById(submissionId);
        if (!submission) {
            req.flash('error', 'Einreichung nicht gefunden');
            return res.redirect('/admin/station');
        }
        const usr = req.session.user;
        if (usr.role !== 'super_admin') {
            const submitter = await User.findById(submission.user_id);
            if (submitter.station_id !== usr.station_id) {
                req.flash('error', 'Keine Berechtigung');
                return res.redirect('/admin/station');
            }
        }
        const status = action === 'approve' ? 'approved' : 'rejected';
        const pointsAwarded = action === 'approve' ? (parseInt(points) || 0) : 0;
        await Submission.review(submissionId, usr.id, status, pointsAwarded, feedback || '');
        if (status === 'approved') {
            await Submission.updateUserPoints(submission.user_id);
            
            // Season-Punkte aufzeichnen
            await Season.recordPoints(submission.user_id, pointsAwarded);
            
            // Cooldown setzen (3 Tage) fÃ¼r Praxis-Challenges
            if (submission.challenge_id) {
                await Challenge.setCooldown(submission.user_id, submission.challenge_id);
            }
        }
        req.flash('success', `Einreichung ${status === 'approved' ? 'bestÃ¤tigt' : 'abgelehnt'}`);
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Review submission error:', error);
        req.flash('error', 'Fehler bei der ÃœberprÃ¼fung');
        res.redirect('/admin/station');
    }
});

// ========= ZUGFÃœHRER FUNKTIONALITÃ„T: MITGLIED AUS LÃ–SCHZUG ENTFERNEN (KICKEN) =========
router.post('/remove-from-station/:id', requireZugfuehrer, async (req, res) => {
    const targetUserId = req.params.id;
    const user = req.session.user;

    // Verhindern, dass du dich selbst rauswirfst
    if (targetUserId == user.id) {
        req.flash('error', 'Du kannst dich nicht selbst aus dem LÃ¶schzug entfernen.');
        return res.redirect('/admin/station');
    }

    if (user.role !== 'super_admin') {
        // PrÃ¼fen, ob der Zielnutzer zu diesem LÃ¶schzug gehÃ¶rt
        const targetUser = await User.findById(targetUserId);
        if (!targetUser || targetUser.station_id !== user.station_id) {
            req.flash('error', 'Entfernung nicht mÃ¶glich: Nutzer gehÃ¶rt nicht zu deinem LÃ¶schzug.');
            return res.redirect('/admin/station');
        }

        // Verhindern, dass andere ZugfÃ¼hrer rausgeworfen werden
        if (targetUser.role === 'zugfuehrer') {
            req.flash('error', 'Du kannst keinen anderen ZugfÃ¼hrer aus dem LÃ¶schzug entfernen.');
            return res.redirect('/admin/station');
        }
    }

    try {
        // 1. Benutzer aus dem LÃ¶schzug entfernen, aber Account aktiv lassen (station_id = NULL)
        await User.update(targetUserId, { station_id: null });
        
        // 2. Erfolgsmeldungen setzen und Weiterleitung
        req.flash('success', 'Mitglied erfolgreich aus dem LÃ¶schzug entfernt. Der Nutzer muss nun eine erneute Bewerbung einreichen.');
        
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Remove member error:', error);
        req.flash('error', 'Fehler bei der Entfernung des Mitglieds: ' + error.message);
        res.redirect('/admin/station');
    }
});

// ==================== CHALLENGE VERWALTUNG ====================
router.get('/challenges', requireSuperAdmin, async (req, res) => {
    try {
        const Challenge = require('../models/Challenge');
        const challenges = await Challenge.findAllForAdmin();
        const stats = {
            total: challenges.length,
            active: challenges.filter(c => c.active).length,
            theorie: challenges.filter(c => c.type === 'theorie' && c.active).length,
            praxis: challenges.filter(c => c.type === 'praxis' && c.active).length,
        };
        res.render('admin/challenges', { title: 'Challenge-Verwaltung', challenges, stats });
    } catch (error) {
        console.error('Challenges page error:', error);
        req.flash('error', 'Fehler beim Laden der Challenges');
        res.redirect('/admin/super');
    }
});

router.post('/challenges/create', requireSuperAdmin, async (req, res) => {
    const { title, description, type, target_group, difficulty, points, active } = req.body;
    try {
        const db = require('../models/db');
        const result = await db.run(
            'INSERT INTO challenges (title, description, type, target_group, points, active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, description, type, target_group, parseInt(points), active ? 1 : 0, req.session.user.id]);
        const challengeId = result.id;
        if (type === 'theorie') {
            for (let i = 1; i <= 30; i++) {
                const qText = req.body[`q${i}_text`];
                const qA = req.body[`q${i}_a`];
                const qB = req.body[`q${i}_b`];
                const qC = req.body[`q${i}_c`];
                const qD = req.body[`q${i}_d`];
                const qCorrect = req.body[`q${i}_correct`];
                if (qText && qA && qB) {
                    await db.run(
                        'INSERT INTO quiz_questions (challenge_id, question, option_a, option_b, option_c, option_d, correct_answer) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [challengeId, qText, qA, qB, qC || '', qD || '', parseInt(qCorrect || 0)]);
                }
            }
        }
        req.flash('success', `Challenge "${title}" erfolgreich erstellt`);
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Create challenge error:', error);
        req.flash('error', 'Fehler beim Erstellen der Challenge: ' + error.message);
        res.redirect('/admin/challenges');
    }
});

router.post('/challenges/delete/:id', requireSuperAdmin, async (req, res) => {
    try {
        const Challenge = require('../models/Challenge');
        await Challenge.delete(req.params.id);
        req.flash('success', 'Challenge gelÃ¶scht');
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Delete challenge error:', error);
        req.flash('error', 'Fehler beim LÃ¶schen');
        res.redirect('/admin/challenges');
    }
});

router.post('/challenges/toggle/:id', requireSuperAdmin, async (req, res) => {
    try {
        const Challenge = require('../models/Challenge');
        const db = require('../models/db');
        const challenge = await db.get('SELECT * FROM challenges WHERE id = ?', [req.params.id]);
        if (!challenge) {
            req.flash('error', 'Challenge nicht gefunden');
            return res.redirect('/admin/challenges');
        }
        await Challenge.update(req.params.id, { active: challenge.active ? 0 : 1 });
        req.flash('success', `Challenge "${challenge.title}" ${challenge.active ? 'deaktiviert' : 'aktiviert'}`);
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Toggle challenge error:', error);
        req.flash('error', 'Fehler beim Ã„ndern des Status');
        res.redirect('/admin/challenges');
    }
});

// Delete invitation
router.post('/delete-invitation/:id', requireZugfuehrer, async (req, res) => {
    try {
        const db = require('../models/db');
        const user = req.session.user;

        // Verify the invitation belongs to user's station
        const invitation = await db.get('SELECT * FROM invitations WHERE id = ?', [req.params.id]);
        if (!invitation) {
            req.flash('error', 'Einladung nicht gefunden');
            return res.redirect('/admin/station');
        }

        if (invitation.station_id !== user.station_id && user.role !== 'super_admin') {
            req.flash('error', 'Keine Berechtigung');
            return res.redirect('/admin/station');
        }

        // Delete invitation and the associated inactive user
        await db.run('UPDATE invitations SET status = ?, used = TRUE, responded_at = datetime("now") WHERE id = ?', ['revoked', req.params.id]);
        await db.run('DELETE FROM users WHERE email LIKE ? AND active = 0', [`%@einladung.${invitation.token.substring(0, 8)}.fw`]);

        req.flash('success', 'Einladung widerrufen');
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Delete invitation error:', error);
        req.flash('error', 'Fehler beim Widerrufen der Einladung');
        res.redirect('/admin/station');
    }
});

// Accept application/invitation - add user to station
router.post('/accept-invitation/:id', requireZugfuehrer, async (req, res) => {
    try {
        const db = require('../models/db');
        const user = req.session.user;

        // Verify the invitation belongs to user's station
        const invitation = await db.get('SELECT * FROM invitations WHERE id = ?', [req.params.id]);
        if (!invitation) {
            req.flash('error', 'Bewerbung nicht gefunden');
            return res.redirect('/admin/station');
        }

        if (invitation.station_id !== user.station_id && user.role !== 'super_admin') {
            req.flash('error', 'Keine Berechtigung');
            return res.redirect('/admin/station');
        }

        // Find the user by email
        const applicant = await db.get('SELECT * FROM users WHERE email = ? AND active = TRUE', [invitation.email]);
        if (!applicant) {
            req.flash('error', 'Benutzer nicht gefunden');
            return res.redirect('/admin/station');
        }

        // Update user's station
        await db.run('UPDATE users SET station_id = ? WHERE id = ?', [invitation.station_id, applicant.id]);

        // Mark invitation as accepted
        await db.run(
            'UPDATE invitations SET status = ?, used = TRUE, responded_at = datetime("now") WHERE id = ?',
            ['accepted', req.params.id]
        );

        req.flash('success', `${applicant.realname} wurde erfolgreich in den LÃ¶schzug aufgenommen.`);
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Accept invitation error:', error);
        req.flash('error', 'Fehler beim Akzeptieren der Bewerbung');
        res.redirect('/admin/station');
    }
});

// Reject application/invitation
router.post('/reject-invitation/:id', requireZugfuehrer, async (req, res) => {
    try {
        const db = require('../models/db');
        const user = req.session.user;

        // Verify the invitation belongs to user's station
        const invitation = await db.get('SELECT * FROM invitations WHERE id = ?', [req.params.id]);
        if (!invitation) {
            req.flash('error', 'Bewerbung nicht gefunden');
            return res.redirect('/admin/station');
        }

        if (invitation.station_id !== user.station_id && user.role !== 'super_admin') {
            req.flash('error', 'Keine Berechtigung');
            return res.redirect('/admin/station');
        }

        // Mark invitation as rejected
        await db.run(
            'UPDATE invitations SET status = ?, used = TRUE, responded_at = datetime("now") WHERE id = ?',
            ['rejected', req.params.id]
        );

        req.flash('success', 'Bewerbung abgelehnt.');
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Reject invitation error:', error);
        req.flash('error', 'Fehler beim Ablehnen der Bewerbung');
        res.redirect('/admin/station');
    }
});

// NEW: User-initiated Transfer Request (Antrag auf Wechsel oder Beitritt)
router.post('/request-transfer', requireAuth, async (req, res) => {
    const { targetStationId } = req.body;
    const user = req.session.user;

    if (!targetStationId) {
        req.flash('error', 'Bitte wÃ¤hle einen LÃ¶schzug aus.');
        return res.redirect('/profile');
    }

    try {
        // PrÃ¼fen, ob das Ziel-LZ existiert und verifiziert ist
        const targetStation = await Station.findById(targetStationId);
        if (!targetStation) {
            req.flash('error', 'Ziel-LÃ¶schzug wurde nicht gefunden.');
            return res.redirect('/profile');
        }

        if (!targetStation.verified) {
            req.flash('error', 'Dieser LÃ¶schzug ist noch nicht verifiziert.');
            return res.redirect('/profile');
        }

        // PrÃ¼fen, ob der Nutzer bereits zu diesem LZ gehÃ¶rt
        if (user.station_id === parseInt(targetStationId)) {
            req.flash('error', 'Du gehÃ¶rst bereits diesem LÃ¶schzug an.');
            return res.redirect('/profile');
        }

        // PrÃ¼fen, ob bereits eine offene Anfrage fÃ¼r dieses LZ existiert
        const db = require('../models/db');
        const existingRequest = await db.get(
            'SELECT * FROM invitations WHERE station_id = ? AND email = ? AND status = ? AND (expires_at IS NULL OR expires_at > datetime("now"))',
            [targetStationId, user.email, 'pending']
        );

        if (existingRequest) {
            req.flash('error', 'Du hast bereits eine offene Bewerbung bei diesem LÃ¶schzug.');
            return res.redirect('/profile');
        }

        // Antrag als Pending-Invitation speichern
        const token = crypto.randomBytes(32).toString('hex');

        await db.run(
            'INSERT INTO invitations (station_id, email, token, role, created_by, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now", "+30 days"))',
            [targetStationId, user.email, token, user.role, user.id, 'pending']
        );

        const message = user.station_id 
            ? 'Deine Anfrage fÃ¼r den Wechsel wurde erfolgreich gesendet! Die ZugfÃ¼hrer des Ziel-LÃ¶schzugs prÃ¼fen diese.'
            : 'Deine Bewerbung wurde erfolgreich gesendet! Die ZugfÃ¼hrer des LÃ¶schzugs prÃ¼fen diese.';

        req.flash('success', message);
        res.redirect('/profile');

    } catch (error) {
        console.error('Transfer request error:', error);
        req.flash('error', 'Fehler beim Senden der Bewerbung: ' + error.message);
        res.redirect('/profile');
    }
});

// Generate password reset link for a member
router.post('/generate-password-reset/:userId', requireZugfuehrer, async (req, res) => {
    try {
        const db = require('../models/db');
        const crypto = require('crypto');
        const user = req.session.user;
        const targetUserId = req.params.userId;
        
        // Verify the target user belongs to user's station
        const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
        if (!targetUser) {
            req.flash('error', 'Nutzer nicht gefunden');
            return res.redirect('/admin/station');
        }
        
        if (targetUser.station_id !== user.station_id && user.role !== 'super_admin') {
            req.flash('error', 'Keine Berechtigung - Nutzer gehÃ¶rt nicht zu deinem LÃ¶schzug');
            return res.redirect('/admin/station');
        }
        
        // Generate reset token
        const token = crypto.randomBytes(32).toString('hex');
        
        // Store reset token (expires in 7 days)
        await db.run(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, datetime("now", "+7 days"))',
            [targetUserId, token]
        );
        
        const resetLink = `${req.protocol}://${req.get('host')}/password-reset/${token}`;
        
        req.flash('success', 'Passwort-Reset-Link erstellt!');
        req.flash('reset_link', resetLink);
        req.flash('reset_user_name', targetUser.realname);
        res.redirect('/admin/station');
    } catch (error) {
        console.error('Generate password reset error:', error);
        req.flash('error', 'Fehler beim Erstellen des Reset-Links');
        res.redirect('/admin/station');
    }
});

router.post('/create-user', requireSuperAdmin, async (req, res) => {
    const { realname, nickname, email, password, role, station_id, city_id } = req.body;
    try {
        if (!realname || !nickname || !email || !password || !role) {
            req.flash('error', 'Bitte alle Pflichtfelder ausfÃ¼llen');
            return res.redirect('/admin/super');
        }

        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            req.flash('error', 'E-Mail bereits vergeben');
            return res.redirect('/admin/super');
        }

        const existingNick = await User.findByNickname(nickname);
        if (existingNick) {
            req.flash('error', 'Nickname bereits vergeben');
            return res.redirect('/admin/super');
        }

        const db = require('../models/db');
        const bcrypt = require('bcryptjs');
        const passwordHash = await bcrypt.hash(password, 10);

        await db.run(
            'INSERT INTO users (realname, nickname, email, password_hash, role, station_id, city_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
            [
                realname.trim(),
                nickname.trim(),
                email.trim(),
                passwordHash,
                role,
                station_id || null,
                role === 'leitstelle' ? (city_id || null) : null
            ]
        );

        req.flash('success', `Nutzer "${realname}" erfolgreich erstellt`);
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Create user error:', error);
        req.flash('error', 'Fehler beim Erstellen: ' + error.message);
        res.redirect('/admin/super');
    }
});
// Push-Benachrichtigungen Admin-Seite
router.get('/push', requireSuperAdmin, async (req, res) => {
    try {
        const Station = require('../models/Station');
        const PushService = require('../models/PushService');
        const { query } = require('../models/db');
        
        const allStations = await Station.findAll();
        const subscriptions = await PushService.getAllSubscriptions();
        const userCount = (await query('SELECT COUNT(*) as count FROM users WHERE active = 1'))[0]?.count || 0;
        
        res.render('admin/push', {
            title: 'Push-Benachrichtigungen',
            allStations: Array.isArray(allStations) ? allStations : [],
            subscriptionCount: Array.isArray(subscriptions) ? subscriptions.length : 0,
            userCount
        });
    } catch (error) {
        console.error('Push admin page error:', error);
        req.flash('error', 'Fehler beim Laden der Push-Seite');
        res.redirect('/admin/super');
    }
});

router.post('/delete-user/:id', requireSuperAdmin, async (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    try {
        if (targetId === req.session.user.id) {
            req.flash('error', 'Du kannst deinen eigenen Account nicht löschen');
            return res.redirect('/admin/super');
        }

        const targetUser = await User.findByIdAdmin(targetId);
        if (!targetUser) {
            req.flash('error', 'Nutzer nicht gefunden');
            return res.redirect('/admin/super');
        }

        if (targetUser.role === 'super_admin') {
            req.flash('error', 'Super-Admins können nicht gelöscht werden');
            return res.redirect('/admin/super');
        }

        const db = require('../models/db');
        await db.run('DELETE FROM users WHERE id = ?', [targetId]);

        req.flash('success', `${targetUser.realname} wurde dauerhaft gelöscht`);
        res.redirect('/admin/super');
    } catch (error) {
        console.error('Delete user error:', error);
        req.flash('error', 'Fehler beim Löschen: ' + error.message);
        res.redirect('/admin/super');
    }
});

// ========= NEW: QR-CODE EINLADUNGSSYSTEM =========

// Zugführer: Einladungen-Verwaltungsseite (GET)
router.get('/invitations', requireZugfuehrer, async (req, res) => {
    try {
        const Invitation = require('../models/Invitation');
        const user = req.session.user;

        // Get station invitations if user is Zugführer
        let invitations = [];
        if (user.role === 'zugfuehrer' && user.station_id) {
            invitations = await Invitation.findByStation(user.station_id);
        } else if (user.role === 'super_admin') {
            invitations = await Invitation.findAll();
        }

        // Get stats for station
        let stats = {};
        if (user.station_id) {
            stats = await Invitation.getStationStats(user.station_id);
        }

        res.render('admin/invitations', {
            title: 'Einladungs-QR-Codes',
            invitations: invitations || [],
            stats: stats || { total: 0, used: 0, revoked: 0, expired: 0 },
            user
        });
    } catch (error) {
        console.error('Invitations page error:', error);
        req.flash('error', 'Fehler beim Laden der Einladungen');
        res.redirect('/admin/station');
    }
});

// Zugführer: Neue Einladung erstellen (POST)
router.post('/invitations/create', requireZugfuehrer, async (req, res) => {
    try {
        const Invitation = require('../models/Invitation');
        const { role, quantity } = req.body;
        const user = req.session.user;

        // Validate inputs
        if (!['ff', 'jf'].includes(role)) {
            req.flash('error', 'Ungültige Rolle');
            return res.redirect('/admin/invitations');
        }

        const qty = Math.min(parseInt(quantity) || 1, 50); // Max 50 invitations at once

        if (!user.station_id) {
            req.flash('error', 'Dein Löschzug konnte nicht gefunden werden');
            return res.redirect('/admin/invitations');
        }

        // Create multiple invitations
        const createdInvitations = [];
        for (let i = 0; i < qty; i++) {
            const invitation = await Invitation.create(user.station_id, role, user.id);
            createdInvitations.push(invitation);
        }

        req.flash('success', `${qty} Einladungs-QR-Code(s) erfolgreich erstellt`);
        res.redirect('/admin/invitations');
    } catch (error) {
        console.error('Create invitation error:', error);
        req.flash('error', 'Fehler beim Erstellen der Einladung: ' + error.message);
        res.redirect('/admin/invitations');
    }
});

// Zugführer: QR-Code anzeigen (GET)
router.get('/invitations/qr/:token', requireZugfuehrer, async (req, res) => {
    try {
        const QRCode = require('qrcode');
        const Invitation = require('../models/Invitation');
        const { token } = req.params;
        const user = req.session.user;

        const invitation = await Invitation.findByToken(token);
        
        if (!invitation) {
            req.flash('error', 'Einladung nicht gefunden oder abgelaufen');
            return res.redirect('/admin/invitations');
        }

        // Verify access
        if (user.role === 'zugfuehrer' && invitation.station_id !== user.station_id) {
            req.flash('error', 'Zugriff verweigert');
            return res.redirect('/admin/invitations');
        }

        // Generate QR code
        const invitationUrl = Invitation.getQRUrl(token, process.env.BASE_URL || 'http://localhost:3000');
        const qrCodeDataUrl = await QRCode.toDataURL(invitationUrl);

        res.render('admin/invitation-qr', {
            title: 'Einladungs-QR-Code',
            token,
            invitation,
            qrCode: qrCodeDataUrl,
            invitationUrl
        });
    } catch (error) {
        console.error('QR code error:', error);
        req.flash('error', 'Fehler beim Generieren des QR-Codes');
        res.redirect('/admin/invitations');
    }
});

// Zugführer: Einladung widerrufen (POST)
router.post('/invitations/revoke/:token', requireZugfuehrer, async (req, res) => {
    try {
        const Invitation = require('../models/Invitation');
        const { token } = req.params;
        const user = req.session.user;

        const invitation = await Invitation.findByToken(token);
        
        if (!invitation) {
            req.flash('error', 'Einladung nicht gefunden');
            return res.redirect('/admin/invitations');
        }

        // Verify access
        if (user.role === 'zugfuehrer' && invitation.station_id !== user.station_id) {
            req.flash('error', 'Zugriff verweigert');
            return res.redirect('/admin/invitations');
        }

        // Get invitation ID from database
        const db = require('../models/db');
        const inv = await db.get('SELECT id FROM invitations WHERE token = ?', [token]);
        
        if (inv) {
            await Invitation.revoke(inv.id);
        }

        req.flash('success', 'Einladung widerrufen');
        res.redirect('/admin/invitations');
    } catch (error) {
        console.error('Revoke invitation error:', error);
        req.flash('error', 'Fehler beim Widerrufen der Einladung');
        res.redirect('/admin/invitations');
    }
});


module.exports = router;
