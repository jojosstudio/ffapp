const express = require('express');
const router = express.Router();
const { requireAuth, blockLeitstelleFromParticipant } = require('../middleware/auth');
const User = require('../models/User');
const Station = require('../models/Station');
const Season = require('../models/Season');
const { query } = require('../models/db');

// Public rankings (nicknames only) with season info
router.get('/', async (req, res) => {
    try {
        const targetGroup = req.query.group || 'both';
        const publicRankings = await User.getPublicRankings(targetGroup);
        const stationRankings = await Station.getStationRankings();
        
        // Get season info for countdown
        const season = await Season.getActive();
        const secondsUntilReset = Season.getSecondsUntilReset();
        
        // Calculate countdown display
        const days = Math.floor(secondsUntilReset / (24 * 3600));
        const hours = Math.floor((secondsUntilReset % (24 * 3600)) / 3600);
        const minutes = Math.floor((secondsUntilReset % 3600) / 60);
        
        res.render('rankings/public', {
            title: 'Ranglisten',
            rankings: publicRankings,
            stationRankings,
            targetGroup,
            showRealNames: false,
            season,
            countdown: { days, hours, minutes, totalSeconds: secondsUntilReset }
        });
    } catch (error) {
        console.error('Rankings error:', error);
        res.render('rankings/public', {
            title: 'Ranglisten',
            rankings: [],
            stationRankings: [],
            targetGroup: 'both',
            season: null,
            countdown: null,
            error: 'Fehler beim Laden der Ranglisten'
        });
    }
});

// Internal station rankings (requires auth and station membership)
router.get('/internal', requireAuth, blockLeitstelleFromParticipant, async (req, res) => {
    try {
        const user = req.session.user;
        
        // Only users with a station can see internal rankings
        if (!user.station_id) {
            req.flash('error', 'Du bist keinem Löschzug zugeordnet');
            return res.redirect('/rankings');
        }
        
        const internalRankings = await User.getInternalRankings(user.station_id);
        const station = await Station.findById(user.station_id);
        
        // Get season info for countdown (internal page too!)
        const season = await Season.getActive();
        const secondsUntilReset = Season.getSecondsUntilReset();
        const days = Math.floor(secondsUntilReset / (24 * 3600));
        const hours = Math.floor((secondsUntilReset % (24 * 3600)) / 3600);
        const minutes = Math.floor((secondsUntilReset % 3600) / 60);
        
        res.render('rankings/internal', {
            title: 'Interne Rangliste',
            rankings: internalRankings,
            station,
            showRealNames: true,
            season,
            countdown: { days, hours, minutes, totalSeconds: secondsUntilReset }
        });
    } catch (error) {
        console.error('Internal rankings error:', error);
        req.flash('error', 'Fehler beim Laden der internen Rangliste');
        res.redirect('/rankings');
    }
});

// View specific past season rankings
router.get('/season/:id', async (req, res) => {
    try {
        const seasonId = req.params.id;
        const targetGroup = req.query.group || 'both';
        
        // Get the season info
        const season = await Season.getById(seasonId);
        if (!season) {
            return res.status(404).render('error', {
                title: 'Season nicht gefunden',
                message: 'Diese Season existiert nicht',
                error: {}
            });
        }
        
        // Get rankings for that season
        const seasonRankings = await Season.getSeasonRankings(seasonId, targetGroup);
        const stationSeasonRankings = await Season.getStationSeasonRankings(seasonId);
        
        // Get all seasons for the dropdown
        const allSeasons = await Season.getAll();
        
        res.render('rankings/season', {
            title: `Rangliste - ${season.name}`,
            rankings: seasonRankings,
            stationRankings: stationSeasonRankings,
            targetGroup,
            season,
            allSeasons,
            showRealNames: false
        });
    } catch (error) {
        console.error('Season rankings error:', error);
        res.status(500).render('error', {
            title: 'Fehler',
            message: 'Fehler beim Laden der Season-Rangliste',
            error: {}
        });
    }
});

module.exports = router;
