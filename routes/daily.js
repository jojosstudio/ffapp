const express = require('express');
const router = express.Router();
const { requireAuth, blockLeitstelleFromParticipant } = require('../middleware/auth');
const DailyChallenge = require('../models/DailyChallenge');
const Challenge = require('../models/Challenge');
const Submission = require('../models/Submission');
const Season = require('../models/Season');

// Show today's daily challenge
router.get('/', requireAuth, blockLeitstelleFromParticipant, async (req, res) => {
    try {
        const daily = await DailyChallenge.getToday();
        const secondsUntilNext = DailyChallenge.getSecondsUntilNext();
        const isDouble = DailyChallenge.isDoublePointsActive();
        
        if (!daily) {
            req.flash('error', 'Keine tägliche Challenge verfügbar');
            return res.redirect('/challenges');
        }
        
        // Get full challenge with questions
        const challenge = await Challenge.findWithQuestions(daily.challenge_id);
        
        if (!challenge) {
            req.flash('error', 'Challenge nicht gefunden');
            return res.redirect('/challenges');
        }
        
        // Check if user already completed this challenge
        const completed = await Submission.hasCompleted(req.session.user.id, challenge.id);
        
        // Check cooldown
        const cooldown = await Challenge.getCooldown(req.session.user.id, challenge.id);
        let canRetry = true;
        let remainingHours = 0;
        let remainingMinutes = 0;
        
        if (cooldown) {
            canRetry = false;
            const now = new Date();
            const cooldownUntil = new Date(cooldown.cooldown_until + 'Z');
            const diffMs = cooldownUntil - now;
            remainingHours = Math.floor(diffMs / (1000 * 60 * 60));
            remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        }
        
        res.render('challenges/daily', {
            title: `⭐ Tägliche Challenge - ${daily.title}`,
            daily,
            challenge,
            completed,
            canRetry,
            cooldownRemaining: { hours: remainingHours, minutes: remainingMinutes },
            secondsUntilNext,
            isDouble,
            countdownFormatted: DailyChallenge.formatCountdown(secondsUntilNext)
        });
    } catch (error) {
        console.error('Daily challenge error:', error);
        req.flash('error', 'Fehler beim Laden der täglichen Challenge');
        res.redirect('/challenges');
    }
});

// Submit daily challenge quiz
router.post('/submit', requireAuth, blockLeitstelleFromParticipant, async (req, res) => {
    try {
        const daily = await DailyChallenge.getToday();
        if (!daily) {
            req.flash('error', 'Keine tägliche Challenge verfügbar');
            return res.redirect('/challenges');
        }
        
        const challenge = await Challenge.findWithQuestions(daily.challenge_id);
        if (!challenge) {
            req.flash('error', 'Challenge nicht gefunden');
            return res.redirect('/challenges');
        }
        
        const userId = req.session.user.id;
        
        // Check if already completed
        if (await Submission.hasCompleted(userId, challenge.id)) {
            req.flash('error', 'Du hast diese Challenge bereits abgeschlossen');
            return res.redirect('/daily-challenge');
        }
        
        // Check cooldown
        const cooldown = await Challenge.getCooldown(userId, challenge.id);
        if (cooldown) {
            req.flash('error', 'Du musst noch warten, bevor du diese Challenge erneut versuchen kannst!');
            return res.redirect('/daily-challenge');
        }
        
        // Calculate score
        const answers = req.body.answers || {};
        let correct = 0;
        let total = challenge.questions.length;
        
        challenge.questions.forEach((q, index) => {
            if (parseInt(answers[index]) === q.correct_answer) {
                correct++;
            }
        });
        
        // Calculate with DOUBLE POINTS multiplier
        const basePoints = Math.round((correct / total) * challenge.points);
        const multipliedPoints = basePoints * daily.multiplier;
        const passed = correct >= (total / 2);
        
        // Create submission
        const submissionId = await Submission.create({
            user_id: userId,
            challenge_id: challenge.id,
            answer_data: { 
                answers, 
                score: multipliedPoints, 
                correct, 
                total, 
                daily: true,
                multiplier: daily.multiplier,
                basePoints 
            },
            proof_image: null
        });
        
        if (passed) {
            await Submission.review(submissionId, null, 'approved', multipliedPoints, 
                `⭐ Tägliche Challenge (${daily.multiplier}x Punkte!)`);
            await Submission.updateUserPoints(userId);
            
            // Season points
            await Season.recordPoints(userId, multipliedPoints);
            
            // Set cooldown (3 days)
            await Challenge.setCooldown(userId, challenge.id);
            
            req.flash('success', 
                `⭐ GLÜCKWUNSCH! Du hast ${multipliedPoints} Punkte erhalten (${correct}/${total} richtig)! ` +
                `(${basePoints} × ${daily.multiplier} Tagesbonus!)`);
        } else {
            await Submission.review(submissionId, null, 'rejected', 0, 'Nicht bestanden');
            req.flash('error', `Leider nicht bestanden (${correct}/${total} richtig).`);
        }
        
        res.redirect('/daily-challenge');
    } catch (error) {
        console.error('Daily challenge submit error:', error);
        req.flash('error', 'Fehler beim Absenden');
        res.redirect('/daily-challenge');
    }
});

// API endpoint for live countdown
router.get('/countdown', async (req, res) => {
    const seconds = DailyChallenge.getSecondsUntilNext();
    res.json({ 
        seconds, 
        formatted: DailyChallenge.formatCountdown(seconds),
        isDouble: DailyChallenge.isDoublePointsActive() 
    });
});

module.exports = router;