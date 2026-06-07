const { loadStationDashboard, handleGenerateInvitation, handleReviewSubmission, handleRemoveMember, handleAcceptInvitation, handleRejectInvitation, handleDeleteInvitation, handlePasswordReset } = require('../services/stationManagement');

const express = require('express');
const router = express.Router();
const { requireLeitstelle } = require('../middleware/auth');
const Station = require('../models/Station');
const User = require('../models/User');
const { canManageStation, getStationRedirect } = require('../utils/stationAccess');
const { run, query } = require('../models/db');

router.get('/', requireLeitstelle, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user.city_id) {
            req.flash('error', 'Deinem Account ist keine Stadt zugewiesen. Bitte kontaktiere den Super Admin.');
            return res.redirect('/profile');
        }

        const city = await Station.getCityById(user.city_id);
        const stations = await Station.getStationsWithStatsForCity(user.city_id);
        const totalMembers = stations.reduce((sum, s) => sum + (s.member_count || 0), 0);
        const totalPending = stations.reduce((sum, s) => sum + (s.pending_invitations || 0) + (s.pending_submissions || 0), 0);

        // Get all users in the city
        const cityUsers = await query(`
            SELECT u.*, s.name as station_name, s.lz_number
            FROM users u
            LEFT JOIN stations s ON u.station_id = s.id
            WHERE u.city_id = ?
            ORDER BY u.realname ASC
        `, [user.city_id]);

        res.render('leitstelle/index', {
            title: 'Leitstelle',
            city,
            stations,
            totalMembers,
            totalPending,
            cityUsers,
            user
        });
    } catch (error) {
        console.error('Leitstelle index error:', error);
        req.flash('error', 'Fehler beim Laden der Leitstelle');
        res.redirect('/profile');
    }
});

router.get('/station/:stationId', requireLeitstelle, async (req, res) => {
    try {
        const stationId = parseInt(req.params.stationId, 10);
        if (!(await canManageStation(req.session.user, stationId))) {
            req.flash('error', 'Keine Berechtigung für diesen Löschzug');
            return res.redirect('/leitstelle');
        }
        await loadStationDashboard(req, res, stationId, { isLeitstelle: true });
    } catch (error) {
        console.error('Leitstelle station error:', error);
        req.flash('error', 'Fehler beim Laden des Löschzugs');
        res.redirect('/leitstelle');
    }
});

router.post('/station/:stationId/generate-invitation', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handleGenerateInvitation(req, res, stationId);
});

router.post('/station/:stationId/review-submission/:id', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handleReviewSubmission(req, res, stationId);
});

router.post('/station/:stationId/remove-member/:id', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handleRemoveMember(req, res, stationId);
});

router.post('/station/:stationId/accept-invitation/:id', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handleAcceptInvitation(req, res, stationId);
});

router.post('/station/:stationId/reject-invitation/:id', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handleRejectInvitation(req, res, stationId);
});

router.post('/station/:stationId/delete-invitation/:id', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handleDeleteInvitation(req, res, stationId);
});

router.post('/station/:stationId/generate-password-reset/:userId', requireLeitstelle, async (req, res) => {
    const stationId = parseInt(req.params.stationId, 10);
    if (!(await canManageStation(req.session.user, stationId))) {
        req.flash('error', 'Keine Berechtigung');
        return res.redirect('/leitstelle');
    }
    await handlePasswordReset(req, res, stationId);
});

// Create new löschzug (station)
router.post('/create-station', requireLeitstelle, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user.city_id) {
            req.flash('error', 'Deinem Account ist keine Stadt zugewiesen.');
            return res.redirect('/leitstelle');
        }

        const { lz_number, name } = req.body;
        if (!lz_number || !name) {
            req.flash('error', 'LZ-Nummer und Name sind erforderlich.');
            return res.redirect('/leitstelle');
        }

        // Check if station with this LZ number already exists in the city
        const existing = await query(
            'SELECT id FROM stations WHERE city_id = ? AND lz_number = ?',
            [user.city_id, parseInt(lz_number)]
        );

        if (existing.length > 0) {
            req.flash('error', 'Ein Löschzug mit dieser LZ-Nummer existiert bereits in dieser Stadt.');
            return res.redirect('/leitstelle');
        }

        await Station.create({
            city_id: user.city_id,
            lz_number: parseInt(lz_number),
            name
        });

        req.flash('success', 'Löschzug erfolgreich erstellt.');
        res.redirect('/leitstelle');
    } catch (error) {
        console.error('Create station error:', error);
        req.flash('error', 'Fehler beim Erstellen des Löschzugs.');
        res.redirect('/leitstelle');
    }
});

// Create zugführer account
router.post('/create-zugfuehrer', requireLeitstelle, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user.city_id) {
            req.flash('error', 'Deinem Account ist keine Stadt zugewiesen.');
            return res.redirect('/leitstelle');
        }

        const { realname, nickname, email, station_id, password } = req.body;
        if (!realname || !nickname || !email || !station_id || !password) {
            req.flash('error', 'Alle Felder sind erforderlich.');
            return res.redirect('/leitstelle');
        }

        // Verify station belongs to leitstelle's city
        const station = await Station.findById(parseInt(station_id));
        if (!station || station.city_id !== user.city_id) {
            req.flash('error', 'Ungültiger Löschzug.');
            return res.redirect('/leitstelle');
        }

        // Check if email or nickname already exists
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            req.flash('error', 'Diese E-Mail-Adresse wird bereits verwendet.');
            return res.redirect('/leitstelle');
        }

        const existingNickname = await User.findByNickname(nickname);
        if (existingNickname) {
            req.flash('error', 'Dieser Spitzname wird bereits verwendet.');
            return res.redirect('/leitstelle');
        }

        await User.create({
            realname,
            nickname,
            email,
            password,
            role: 'zugfuehrer',
            station_id: parseInt(station_id)
        });

        req.flash('success', 'Zugführer-Account erfolgreich erstellt.');
        res.redirect('/leitstelle');
    } catch (error) {
        console.error('Create zugfuehrer error:', error);
        req.flash('error', 'Fehler beim Erstellen des Zugführers.');
        res.redirect('/leitstelle');
    }
});

// Toggle account active status
router.post('/toggle-user-status/:userId', requireLeitstelle, async (req, res) => {
    try {
        const user = req.session.user;
        const targetUserId = parseInt(req.params.userId);

        // Get target user
        const targetUser = await User.findByIdAdmin(targetUserId);
        if (!targetUser) {
            req.flash('error', 'Benutzer nicht gefunden.');
            return res.redirect('/leitstelle');
        }

        // Check if target user is in leitstelle's city
        if (targetUser.city_id !== user.city_id) {
            req.flash('error', 'Keine Berechtigung für diesen Benutzer.');
            return res.redirect('/leitstelle');
        }

        // Don't allow deactivating other leitstelle users
        if (targetUser.role === 'leitstelle') {
            req.flash('error', 'Leitstelle-Benutzer können nicht deaktiviert werden.');
            return res.redirect('/leitstelle');
        }

        // Toggle active status
        await User.update(targetUserId, { active: !targetUser.active });

        req.flash('success', targetUser.active ? 'Benutzer deaktiviert.' : 'Benutzer aktiviert.');
        res.redirect('/leitstelle');
    } catch (error) {
        console.error('Toggle user status error:', error);
        req.flash('error', 'Fehler beim Ändern des Benutzerstatus.');
        res.redirect('/leitstelle');
    }
});

// Toggle city exclusion from rankings
router.post('/toggle-city-exclusion', requireLeitstelle, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user.city_id) {
            req.flash('error', 'Deinem Account ist keine Stadt zugewiesen.');
            return res.redirect('/leitstelle');
        }

        const city = await Station.getCityById(user.city_id);
        const newStatus = city.excluded_from_rankings ? 0 : 1;

        await run(
            'UPDATE cities SET excluded_from_rankings = ? WHERE id = ?',
            [newStatus, user.city_id]
        );

        req.flash('success', newStatus ? 'Stadt von Ranglisten ausgeschlossen.' : 'Stadt in Ranglisten aufgenommen.');
        res.redirect('/leitstelle');
    } catch (error) {
        console.error('Toggle city exclusion error:', error);
        req.flash('error', 'Fehler beim Ändern der Ranglisten-Einstellung.');
        res.redirect('/leitstelle');
    }
});

module.exports = router;
