/**
 * Challenge-Import-Script
 * Importiert alle Fragen aus data/ in die challenges + quiz_questions Tabellen
 * Erstellt für jeden Themenbereich eine Challenge mit ~10 Fragen
 * 
 * Aufruf: node scripts/seed-challenges-from-data.js
 */

const path = require('path');
const fs = require('fs');
const { query, run, get } = require('../models/db');

// Mapping von Hauptordnern zu Zielgruppen
const FOLDER_TARGET_MAP = {
    'FF': 'ff',
    'JF': 'jf', 
    'Funk': 'both',
    'fwdv': 'both',
    'FwDV3': 'both',
    'FwDV7': 'both',
    'FwDV10': 'both',
    'KG': 'both'
};

// Maximale Fragen pro Challenge
const MAX_QUESTIONS_PER_CHALLENGE = 15;
const MIN_QUESTIONS_PER_CHALLENGE = 2;

async function loadQuestionsFromData() {
    const dataDir = path.join(__dirname, '..', 'data');
    const questions = [];
    
    // Read index.json for structure
    const indexPath = path.join(dataDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
        console.error('index.json nicht gefunden in', dataDir);
        return questions;
    }
    
    const structure = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    
    function traverse(node, parentPath = '') {
        if (!node || !node.children) return;
        
        for (const child of node.children) {
            const currentPath = parentPath ? `${parentPath}/${child.name}` : child.name;
            
            if (child.type === 'folder' && child.children) {
                traverse(child, currentPath);
            } else if (child.type === 'question') {
                questions.push({
                    ...child,
                    path: currentPath,
                    mainFolder: parentPath.split('/')[0] || parentPath
                });
            } else if (child.type === 'item' && child.children) {
                // Some items have children directly
                for (const item of child.children) {
                    if (item.type === 'question') {
                        questions.push({
                            ...item,
                            path: currentPath,
                            mainFolder: parentPath.split('/')[0] || parentPath
                        });
                    }
                }
            }
        }
    }
    
    for (const item of structure) {
        if (item.type === 'folder') {
            traverse(item, item.name);
        }
    }
    
    return questions;
}

async function getOrCreateChallenge(title, description, type, targetGroup, points) {
    // Check if challenge already exists
    const existing = await get(
        'SELECT * FROM challenges WHERE title = ? AND active = TRUE',
        [title]
    );
    
    if (existing) {
        // Update points if they've changed
        if (existing.points !== points || existing.target_group !== targetGroup) {
            await run(`
                UPDATE challenges SET points = ?, target_group = ?, description = ?
                WHERE id = ?
            `, [points, targetGroup, description, existing.id]);
        }
        return existing;
    }
    
    const result = await run(`
        INSERT INTO challenges (title, description, type, target_group, points, created_by, active)
        VALUES (?, ?, ?, ?, ?, 1, TRUE)
    `, [title, description, type, targetGroup, points]);
    
    return await get('SELECT * FROM challenges WHERE id = ?', [result.id]);
}

async function addQuestionIfNotExists(challengeId, question, options, correctAnswer) {
    // Check if question already exists for this challenge
    const existing = await get(
        'SELECT id FROM quiz_questions WHERE challenge_id = ? AND question = ?',
        [challengeId, question]
    );
    
    if (existing) return existing;
    
    const result = await run(`
        INSERT INTO quiz_questions (challenge_id, question, option_a, option_b, option_c, option_d, correct_answer)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        challengeId, 
        question, 
        options[0] || '', 
        options[1] || '', 
        options[2] || '', 
        options[3] || '', 
        correctAnswer
    ]);
    
    return result;
}

async function seed() {
    console.log('📚 Lade Fragen aus data/...');
    const questions = await loadQuestionsFromData();
    console.log(`   ${questions.length} Fragen gefunden`);
    
    if (questions.length === 0) {
        console.error('❌ Keine Fragen gefunden!');
        process.exit(1);
    }
    
    // Group questions by their subfolder path for creating challenges
    // E.g.: "FF/Basiswissen" -> one challenge
    const challengeGroups = new Map();
    
    for (const q of questions) {
        // Get the subfolder (e.g., "FF/Basiswissen" from "FF/Basiswissen")
        const parts = q.path.split('/');
        const mainFolder = parts[0];
        const subFolder = parts.length > 1 ? parts[1] : 'Allgemein';
        const key = `${mainFolder}/${subFolder}`;
        
        if (!challengeGroups.has(key)) {
            challengeGroups.set(key, []);
        }
        challengeGroups.get(key).push(q);
    }
    
    console.log(`   ${challengeGroups.size} Challenge-Gruppen identifiziert\n`);
    
    let createdCount = 0;
    let questionCount = 0;
    let skippedCount = 0;
    
    for (const [key, groupQuestions] of challengeGroups) {
        if (groupQuestions.length < MIN_QUESTIONS_PER_CHALLENGE) {
            console.log(`   ⏭️  ${key}: nur ${groupQuestions.length} Fragen (min. ${MIN_QUESTIONS_PER_CHALLENGE}) - übersprungen`);
            skippedCount++;
            continue;
        }
        
        const parts = key.split('/');
        const mainFolder = parts[0];
        const subFolder = parts[1];
        
        // Determine target group
        const targetGroup = FOLDER_TARGET_MAP[mainFolder] || 'both';
        
        // Create challenge title
        const title = `${mainFolder} - ${subFolder}`;
        const description = `Quiz zu ${subFolder} aus dem Bereich ${mainFolder}`;
        
        try {
            // Add questions (limit to max per challenge) - NEED TO DO THIS BEFORE CALCULATING POINTS
            const questionsToAdd = groupQuestions.slice(0, MAX_QUESTIONS_PER_CHALLENGE);
            let actualAdded = 0;
            
            // First, ensure challenge exists (without points, we'll update after)
            const challenge = await getOrCreateChallenge(title, description, 'theorie', targetGroup, 0);
            const validQ = [];
            
            if (challenge) {
                for (const q of questionsToAdd) {
                    if (q.answers && q.answers.length >= 2) {
                        const options = [...q.answers];
                        while (options.length < 4) options.push('');
                        const correctAnswer = q.correctAnswers ? q.correctAnswers[0] : 0;
                        
                        await addQuestionIfNotExists(
                            challenge.id,
                            q.text,
                            options,
                            correctAnswer
                        );
                        actualAdded++;
                        questionCount++;
                    }
                }
                
                // Punkte basierend auf tatsächlich hinzugefügten Fragen
                let points;
                if (mainFolder === 'KG') {
                    points = Math.max(1, Math.ceil(actualAdded / 10));
                } else if (mainFolder === 'JF') {
                    points = Math.max(1, Math.ceil(actualAdded / 5));
                } else {
                    points = actualAdded;
                }
                
                // Punkte aktualisieren
                await run('UPDATE challenges SET points = ? WHERE id = ?', [points, challenge.id]);
                
                console.log(`   ✅ ${title}: ${actualAdded} Fragen | ${points} Punkte | Ziel: ${targetGroup}`);
                createdCount++;
            }
        } catch (err) {
            console.error(`   ❌ ${title}: Fehler - ${err.message}`);
        }
    }
    
    console.log(`\n📊 Zusammenfassung:`);
    console.log(`   ${createdCount} Challenges erstellt/aktualisiert`);
    console.log(`   ${questionCount} Fragen importiert`);
    console.log(`   ${skippedCount} Gruppen übersprungen (zu wenige Fragen)`);
    console.log(`   ${challengeGroups.size - createdCount - skippedCount} Gruppen fehlgeschlagen`);
}

seed().catch(err => {
    console.error('Fataler Fehler:', err);
    process.exit(1);
});