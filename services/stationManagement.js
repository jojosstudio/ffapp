const crypto = require('crypto');
const User = require('../models/User');
const Station = require('../models/Station');
const Submission = require('../models/Submission');
const { getStationRedirect } = require('../utils/stationAccess');

async function loadStationDashboard(req, res, stationId, options = {}) {
    const station = await Station.findById(stationId);
    if (!station) {
        req.flash('error', 'Löschzug nicht gefunden');
        return res.redirect(options.isLeitstelle ? '/leitstelle' : '/dashboard');
    }

    const members = await User.findByStation(stationId);
    const pendingSubmissions = await Submission.getPendingForStation(stationId);
    const pendingInvitations = await Station.getPendingInvitations(stationId);

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

    const activeMembers = members.filter(m => m.active);
    const totalPoints = options.isLeitstelle ? null : activeMembers.reduce((sum, m) => sum + (m.points || 0), 0);

    res.render('admin/station-dashboard', {
        title: options.isLeitstelle ? 'Löschzug verwalten' : 'Löschzug Verwaltung',
        station,
        members: activeMembers,
        totalPoints,
        pendingSubmissions,
        pendingInvitations: formattedInvitations,
        user: req.session.user,
        isLeitstelle: !!options.isLeitstelle,
        backUrl: options.isLeitstelle ? '/leitstelle' : null,
        stationActionBase: options.isLeitstelle ? `/leitstelle/station/${stationId}` : '/admin'
    });
}

async function handleGenerateInvitation(req, res, stationId) {
    const { nickname, realname, role } = req.body;
    const user = req.session.user;
    const redirect = getStationRedirect(user, stationId);

    try {
        if (!nickname || !realname || !role) {
            req.flash('error', 'Bitte fülle alle Felder aus');
            return res.redirect(redirect);
        }

        const existing = await User.findByNickname(nickname);
        if (existing) {
            req.flash('error', 'Nickname bereits vergeben');
            return res.redirect(redirect);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const db = require('../models/db');
        const inviteEmail = nickname + '@einladung.' + token.substring(0, 8) + '.fw';

        await db.run(
            'INSERT INTO users (realname, nickname, email, password_hash, role, station_id, active) VALUES (?, ?, ?, ?, ?, ?, 0)',
            [realname, nickname, inviteEmail, null, role, stationId]
        );

        await db.run(
            'INSERT OR IGNORE INTO invitations (station_id, email, token, role, created_by, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now", "+30 days"))',
            [stationId, inviteEmail, token, role, user.id, 'pending']
        );

        req.flash('success', 'Einladung erstellt!');
        req.flash('invite_link', `${req.protocol}://${req.get('host')}/einladung/${token}`);
        req.flash('invite_nickname', nickname);
        req.flash('invite_realname', realname);
        req.flash('invite_role', role);
        req.flash('invite_password', token.substring(0, 12));
        res.redirect(redirect);
    } catch (error) {
        console.error('Generate invitation error:', error);
        req.flash('error', 'Fehler beim Erstellen der Einladung');
        res.redirect(redirect);
    }
}

async function handleReviewSubmission(req, res, stationId) {
    const { action, points, feedback } = req.body;
    const submissionId = req.params.id;
    const redirect = getStationRedirect(req.session.user, stationId);

    try {
        const submission = await Submission.findById(submissionId);
        if (!submission) {
            req.flash('error', 'Einreichung nicht gefunden');
            return res.redirect(redirect);
        }

        const submitter = await User.findById(submission.user_id);
        if (!submitter || submitter.station_id !== stationId) {
            req.flash('error', 'Keine Berechtigung');
            return res.redirect(redirect);
        }

        const status = action === 'approve' ? 'approved' : 'rejected';
        const pointsAwarded = action === 'approve' ? (parseInt(points, 10) || 0) : 0;
        await Submission.review(submissionId, req.session.user.id, status, pointsAwarded, feedback || '');
        if (status === 'approved') {
            await Submission.updateUserPoints(submission.user_id);
        }
        req.flash('success', `Einreichung ${status === 'approved' ? 'bestätigt' : 'abgelehnt'}`);
        res.redirect(redirect);
    } catch (error) {
        console.error('Review submission error:', error);
        req.flash('error', 'Fehler bei der Überprüfung');
        res.redirect(redirect);
    }
}

async function handleRemoveMember(req, res, stationId) {
    const targetUserId = req.params.id;
    const user = req.session.user;
    const redirect = getStationRedirect(user, stationId);

    if (targetUserId == user.id) {
        req.flash('error', 'Du kannst dich nicht selbst aus dem Löschzug entfernen.');
        return res.redirect(redirect);
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser || targetUser.station_id !== stationId) {
        req.flash('error', 'Entfernung nicht möglich: Nutzer gehört nicht zu diesem Löschzug.');
        return res.redirect(redirect);
    }

    if (targetUser.role === 'zugfuehrer') {
        req.flash('error', 'Du kannst keinen Zugführer aus dem Löschzug entfernen.');
        return res.redirect(redirect);
    }

    try {
        await User.update(targetUserId, { station_id: null });
        req.flash('success', 'Mitglied erfolgreich aus dem Löschzug entfernt.');
        res.redirect(redirect);
    } catch (error) {
        console.error('Remove member error:', error);
        req.flash('error', 'Fehler bei der Entfernung des Mitglieds');
        res.redirect(redirect);
    }
}

async function handleDeleteInvitation(req, res, stationId) {
    const redirect = getStationRedirect(req.session.user, stationId);

    try {
        const db = require('../models/db');
        const invitation = await db.get('SELECT * FROM invitations WHERE id = ?', [req.params.id]);

        if (!invitation || invitation.station_id !== stationId) {
            req.flash('error', 'Einladung nicht gefunden');
            return res.redirect(redirect);
        }

        await db.run('UPDATE invitations SET status = ?, used = TRUE, responded_at = datetime("now") WHERE id = ?', ['revoked', req.params.id]);
        await db.run('DELETE FROM users WHERE email LIKE ? AND active = 0', [`%@einladung.${invitation.token.substring(0, 8)}.fw`]);

        req.flash('success', 'Einladung widerrufen');
        res.redirect(redirect);
    } catch (error) {
        console.error('Delete invitation error:', error);
        req.flash('error', 'Fehler beim Widerrufen der Einladung');
        res.redirect(redirect);
    }
}

async function handleAcceptInvitation(req, res, stationId) {
    const redirect = getStationRedirect(req.session.user, stationId);

    try {
        const db = require('../models/db');
        const invitation = await db.get('SELECT * FROM invitations WHERE id = ?', [req.params.id]);

        if (!invitation || invitation.station_id !== stationId) {
            req.flash('error', 'Bewerbung nicht gefunden');
            return res.redirect(redirect);
        }

        const applicant = await db.get('SELECT * FROM users WHERE email = ? AND active = TRUE', [invitation.email]);
        if (!applicant) {
            req.flash('error', 'Benutzer nicht gefunden');
            return res.redirect(redirect);
        }

        await db.run('UPDATE users SET station_id = ? WHERE id = ?', [invitation.station_id, applicant.id]);
        await db.run(
            'UPDATE invitations SET status = ?, used = TRUE, responded_at = datetime("now") WHERE id = ?',
            ['accepted', req.params.id]
        );

        req.flash('success', `${applicant.realname} wurde erfolgreich in den Löschzug aufgenommen.`);
        res.redirect(redirect);
    } catch (error) {
        console.error('Accept invitation error:', error);
        req.flash('error', 'Fehler beim Akzeptieren der Bewerbung');
        res.redirect(redirect);
    }
}

async function handleRejectInvitation(req, res, stationId) {
    const redirect = getStationRedirect(req.session.user, stationId);

    try {
        const db = require('../models/db');
        const invitation = await db.get('SELECT * FROM invitations WHERE id = ?', [req.params.id]);

        if (!invitation || invitation.station_id !== stationId) {
            req.flash('error', 'Bewerbung nicht gefunden');
            return res.redirect(redirect);
        }

        await db.run(
            'UPDATE invitations SET status = ?, used = TRUE, responded_at = datetime("now") WHERE id = ?',
            ['rejected', req.params.id]
        );

        req.flash('success', 'Bewerbung abgelehnt.');
        res.redirect(redirect);
    } catch (error) {
        console.error('Reject invitation error:', error);
        req.flash('error', 'Fehler beim Ablehnen der Bewerbung');
        res.redirect(redirect);
    }
}

async function handlePasswordReset(req, res, stationId) {
    const redirect = getStationRedirect(req.session.user, stationId);

    try {
        const db = require('../models/db');
        const targetUserId = req.params.userId;
        const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [targetUserId]);

        if (!targetUser || targetUser.station_id !== stationId) {
            req.flash('error', 'Nutzer nicht gefunden oder gehört nicht zu diesem Löschzug');
            return res.redirect(redirect);
        }

        const token = crypto.randomBytes(32).toString('hex');
        await db.run(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, datetime("now", "+7 days"))',
            [targetUserId, token]
        );

        req.flash('success', 'Passwort-Reset-Link erstellt!');
        req.flash('reset_link', `${req.protocol}://${req.get('host')}/password-reset/${token}`);
        req.flash('reset_user_name', targetUser.realname);
        res.redirect(redirect);
    } catch (error) {
        console.error('Generate password reset error:', error);
        req.flash('error', 'Fehler beim Erstellen des Reset-Links');
        res.redirect(redirect);
    }
}

module.exports = {
    loadStationDashboard,
    handleGenerateInvitation,
    handleReviewSubmission,
    handleRemoveMember,
    handleDeleteInvitation,
    handleAcceptInvitation,
    handleRejectInvitation,
    handlePasswordReset
};
