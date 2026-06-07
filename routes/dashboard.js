const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Station = require('../models/Station');
const Challenge = require('../models/Challenge');
const Submission = require('../models/Submission');

// Main dashboard
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);

        if (user.role === 'leitstelle') {
            return res.redirect('/leitstelle');
        }
        
        const stats = await Submission.getUserStats(user.id);
        
        let context = {
            title: 'Dashboard',
            user,
            stats,
            role: user.role
        };
        
        // Role-specific data
        if (user.role === 'super_admin') {
            // Super admin sees all pending verifications
            const unverifiedStations = await Station.findAll(false);
            const pendingSubmissions = await Submission.findAll({ status: 'pending' });
            
            context.unverifiedStations = unverifiedStations;
            context.pendingSubmissions = pendingSubmissions;
            context.totalUsers = (await User.findAll()).length;
            context.totalStations = (await Station.findAll()).length;
            
        } else if (user.role === 'zugfuehrer') {
            // Zugfuehrer sees station data
            const stationMembers = await User.findByStation(user.station_id);
            const pendingSubmissions = await Submission.getPendingForStation(user.station_id);
            
            context.stationMembers = stationMembers;
            context.pendingSubmissions = pendingSubmissions;
            context.station = await Station.findById(user.station_id);
            
        } else {
            // Regular members see available challenges
            const availableChallenges = await Challenge.getAvailableForUser(
                user.id, 
                user.role
            );
            
            context.availableChallenges = availableChallenges;
        }
        
        res.render('dashboard/index', context);
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error', 'Fehler beim Laden des Dashboards');
        res.render('dashboard/index', {
            title: 'Dashboard',
            user: req.session.user,
            error: 'Fehler beim Laden der Daten'
        });
    }
});

module.exports = router;
