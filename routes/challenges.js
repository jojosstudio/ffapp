const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth, requireRole, requireSuperAdmin, requireZugfuehrer, blockLeitstelleFromParticipant } = require('../middleware/auth');
const Challenge = require('../models/Challenge');
const Submission = require('../models/Submission');
const User = require('../models/User');
const Season = require('../models/Season');
const DailyChallenge = require('../models/DailyChallenge');

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Nur Bilder sind erlaubt (JPEG, PNG, GIF)'));
    }
});

// List all challenges (with cooldown info + daily challenge banner)
router.get('/', requireAuth, blockLeitstelleFromParticipant, async (req, res) => {
    try {
        const user = req.session.user;
        const challenges = await Challenge.getAllForUserWithCooldown(user.id, user.role);
        
        // Get daily challenge info for the banner
        let daily = null;
        try {
            daily = await DailyChallenge.getToday();
        } catch (e) {
            // Non-critical, just skip daily banner
        }
        const secondsUntilNext = daily ? DailyChallenge.getSecondsUntilNext() : 0;
        
        res.render('challenges/list', {
            title: 'Challenges',
            challenges,
            filters: req.query,
            daily,
            secondsUntilNext,
            countdownFormatted: daily ? DailyChallenge.formatCountdown(secondsUntilNext) : ''
        });
    } catch (error) {
        console.error('Challenges list error:', error);
        req.flash('error', 'Fehler beim Laden der Challenges');
        res.redirect('/dashboard');
    }
});

// New challenge form (Super Admin only)
router.get('/new', requireSuperAdmin, (req, res) => {
    res.render('challenges/form', {
        title: 'Neue Challenge erstellen',
        challenge: null
    });
});

// Create new challenge
router.post('/new', requireSuperAdmin, async (req, res) => {
    const { title, description, type, target_group, points } = req.body;
    
    try {
        const challengeId = await Challenge.create({
            title,
            description,
            type,
            target_group,
            points: parseInt(points) || 10,
            created_by: req.session.user.id
        });
        
        // If it's a theory challenge, add questions
        if (type === 'theorie' && req.body.questions) {
            const questions = JSON.parse(req.body.questions);
            for (const q of questions) {
                await Challenge.addQuestion(
                    challengeId,
                    q.question,
                    q.options,
                    q.correctAnswer
                );
            }
        }
        
        req.flash('success', 'Challenge erfolgreich erstellt');
        res.redirect('/challenges');
    } catch (error) {
        console.error('Create challenge error:', error);
        req.flash('error', 'Fehler beim Erstellen der Challenge');
        res.redirect('/challenges/new');
    }
});

// View single challenge (with cooldown check)
router.get('/:id', requireAuth, blockLeitstelleFromParticipant, async (req, res) => {
    try {
        const challenge = await Challenge.findWithQuestions(req.params.id);
        
        if (!challenge) {
            req.flash('error', 'Challenge nicht gefunden');
            return res.redirect('/challenges');
        }
        
        // Check if user already completed this challenge
        const completed = await Submission.hasCompleted(req.session.user.id, challenge.id);
        
        // Check cooldown
        const cooldown = await Challenge.getCooldown(req.session.user.id, challenge.id);
        let remainingHours = 0;
        let remainingMinutes = 0;
        let canRetry = true;
        
        if (cooldown) {
            canRetry = false;
            const now = new Date();
            const cooldownUntil = new Date(cooldown.cooldown_until + 'Z');
            const diffMs = cooldownUntil - now;
            remainingHours = Math.floor(diffMs / (1000 * 60 * 60));
            remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        }
        
        res.render('challenges/detail', {
            title: challenge.title,
            challenge,
            completed,
            canRetry,
            cooldownRemaining: { hours: remainingHours, minutes: remainingMinutes }
        });
    } catch (error) {
        console.error('Challenge detail error:', error);
        req.flash('error', 'Fehler beim Laden der Challenge');
        res.redirect('/challenges');
    }
});

// Submit theory challenge (Quiz) - with cooldown + season points
router.post('/:id/submit-quiz', requireAuth, blockLeitstelleFromParticipant, async (req, res) => {
    try {
        const challenge = await Challenge.findWithQuestions(req.params.id);
        
        if (!challenge || challenge.type !== 'theorie') {
            req.flash('error', 'Challenge nicht gefunden oder keine Theorie-Challenge');
            return res.redirect('/challenges');
        }
        
        const userId = req.session.user.id;
        
        // Check if already completed
        if (await Submission.hasCompleted(userId, challenge.id)) {
            req.flash('error', 'Du hast diese Challenge bereits abgeschlossen');
            return res.redirect('/challenges');
        }
        
        // Check cooldown
        const cooldown = await Challenge.getCooldown(userId, challenge.id);
        if (cooldown) {
            req.flash('error', 'Du musst noch 3 Tage warten, bevor du diese Challenge erneut versuchen kannst!');
            return res.redirect(`/challenges/${challenge.id}`);
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
        
        const score = Math.round((correct / total) * challenge.points);
        const passed = correct >= (total / 2); // At least 50% correct
        
        // Create submission
        const submissionId = await Submission.create({
            user_id: userId,
            challenge_id: challenge.id,
            answer_data: { answers, score, correct, total },
            proof_image: null
        });
        
        if (passed) {
            // Auto-approve theory challenges
            await Submission.review(submissionId, null, 'approved', score, 'Automatisch bestanden');
            await Submission.updateUserPoints(userId);
            
            // Record season points
            await Season.recordPoints(userId, score);
            
            // Set cooldown (3 days)
            await Challenge.setCooldown(userId, challenge.id);
            
            req.flash('success', `Glückwunsch! Du hast ${score} Punkte erhalten (${correct}/${total} richtig). Nächster Versuch in 3 Tagen möglich.`);
        } else {
            await Submission.review(submissionId, null, 'rejected', 0, 'Nicht bestanden');
            req.flash('error', `Leider nicht bestanden (${correct}/${total} richtig).`);
        }
        
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Quiz submission error:', error);
        req.flash('error', 'Fehler beim Absenden des Quiz');
        res.redirect('/challenges');
    }
});

// Submit practice challenge (with cooldown + season points)
router.post('/:id/submit-practice', requireAuth, blockLeitstelleFromParticipant, upload.single('proof'), async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        
        if (!challenge || challenge.type !== 'praxis') {
            req.flash('error', 'Challenge nicht gefunden oder keine Praxis-Challenge');
            return res.redirect('/challenges');
        }
        
        const userId = req.session.user.id;
        
        // Check if already completed
        if (await Submission.hasCompleted(userId, challenge.id)) {
            req.flash('error', 'Du hast diese Challenge bereits abgeschlossen');
            return res.redirect('/challenges');
        }
        
        // Check cooldown
        const cooldown = await Challenge.getCooldown(userId, challenge.id);
        if (cooldown) {
            req.flash('error', 'Du musst noch 3 Tage warten, bevor du diese Challenge erneut versuchen kannst!');
            return res.redirect(`/challenges/${challenge.id}`);
        }
        
        if (!req.file) {
            req.flash('error', 'Bitte lade ein Bild als Nachweis hoch');
            return res.redirect(`/challenges/${req.params.id}`);
        }
        
        // Create pending submission
        await Submission.create({
            user_id: userId,
            challenge_id: challenge.id,
            answer_data: { description: req.body.description || '' },
            proof_image: req.file.filename
        });
        
        req.flash('success', 'Einreichung erfolgreich! Dein Zugführer wird sie überprüfen.');
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Practice submission error:', error);
        req.flash('error', 'Fehler beim Absenden der Einreichung');
        res.redirect('/challenges');
    }
});

module.exports = router;