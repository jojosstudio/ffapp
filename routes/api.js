const express = require('express');
const router = express.Router();
const Station = require('../models/Station');
const PushService = require('../models/PushService');
const { query, run } = require('../models/db');

// Get states (for dropdown)
router.get('/states', async (req, res) => {
    try {
        const states = await Station.getStates();
        res.json(states);
    } catch (error) {
        console.error('API states error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Bundesländer' });
    }
});

// Get cities by state
router.get('/cities/:stateId', async (req, res) => {
    try {
        const cities = await Station.getCitiesByState(req.params.stateId);
        res.json(cities);
    } catch (error) {
        console.error('API cities error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Städte' });
    }
});

// Find city by postal code (PLZ) - uses full postal_codes table
router.get('/city-by-plz/:plz', async (req, res) => {
    try {
        const plz = req.params.plz;
        if (!plz || plz.length < 4) {
            return res.json([]);
        }
        // First try exact match in postal_codes table
        let cities = await query(`
            SELECT DISTINCT c.id, c.name, c.type, pc.plz
            FROM postal_codes pc
            JOIN cities c ON pc.city_id = c.id
            WHERE pc.plz LIKE ?
            ORDER BY c.name
            LIMIT 20
        `, [`${plz}%`]);
        
        // If exact PLZ found, filter to that exact PLZ only
        if (plz.length === 5 && cities.length > 0) {
            cities = await query(`
                SELECT DISTINCT c.id, c.name, c.type, pc.plz
                FROM postal_codes pc
                JOIN cities c ON pc.city_id = c.id
                WHERE pc.plz = ?
                ORDER BY c.name
            `, [plz]);
        }
        
        res.json(cities);
    } catch (error) {
        console.error('API PLZ lookup error:', error);
        res.status(500).json({ error: 'Fehler bei der PLZ-Suche' });
    }
});

// Create new city on the fly (for zugfuehrer registration)
router.post('/create-city', async (req, res) => {
    try {
        const { name, type, state_id } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name erforderlich' });
        }
        const result = await run(
            'INSERT INTO cities (state_id, name, type) VALUES (?, ?, ?)',
            [state_id || 1, name, type || 'kreisfreie_stadt']
        );
        res.json({ id: result.id, name, type: type || 'kreisfreie_stadt' });
    } catch (error) {
        console.error('API create city error:', error);
        res.status(500).json({ error: 'Fehler beim Erstellen der Stadt' });
    }
});

// Create new station on the fly (for zugfuehrer registration)
router.post('/create-station', async (req, res) => {
    try {
        const { city_id, lz_number, name } = req.body;
        if (!city_id || !lz_number || !name) {
            return res.status(400).json({ error: 'Alle Felder erforderlich' });
        }
        const result = await run(
            'INSERT INTO stations (city_id, lz_number, name, verified) VALUES (?, ?, ?, 1)',
            [city_id, parseInt(lz_number), name]
        );
        res.json({ id: result.id, lz_number: parseInt(lz_number), name });
    } catch (error) {
        console.error('API create station error:', error);
        res.status(500).json({ error: 'Fehler beim Erstellen des Löschzugs' });
    }
});

// Get stations by city
router.get('/stations/:cityId', async (req, res) => {
    try {
        const stations = await Station.findByCity(req.params.cityId);
        res.json(stations);
    } catch (error) {
        console.error('API stations error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Löschzüge' });
    }
});

// Get full NRW structure
router.get('/nrw-structure', async (req, res) => {
    try {
        const structure = await Station.getNrwStructure();
        res.json(structure);
    } catch (error) {
        console.error('API structure error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Struktur' });
    }
});

// ============ PUSH-BENACHRICHTIGUNGEN ============

// Subscription speichern (vom Client)
router.post('/push/subscribe', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Nicht angemeldet' });
        }
        await PushService.subscribe(req.session.user.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Push subscribe error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Subscription entfernen
router.post('/push/unsubscribe', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Nicht angemeldet' });
        }
        const { endpoint } = req.body;
        if (endpoint) {
            await PushService.unsubscribe(req.session.user.id, endpoint);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Push an alle senden (nur super_admin)
router.post('/push/send-all', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }
        const { title, body, url } = req.body;
        if (!title || !body) {
            return res.status(400).json({ error: 'Titel und Nachricht erforderlich' });
        }
        const result = await PushService.sendToAll(title, body, url || '/');
        res.json(result);
    } catch (error) {
        console.error('Push send-all error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Push an Station senden (nur super_admin oder zugfuehrer)
router.post('/push/send-station', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Nicht angemeldet' });
        }
        const { stationId, title, body, url } = req.body;
        if (!title || !body) {
            return res.status(400).json({ error: 'Titel und Nachricht erforderlich' });
        }
        
        // Prüfen: Super-Admin darf an jede Station senden, Zugführer nur an eigene
        if (req.session.user.role !== 'super_admin' && req.session.user.role !== 'zugfuehrer') {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }
        if (req.session.user.role === 'zugfuehrer' && req.session.user.station_id != stationId) {
            return res.status(403).json({ error: 'Keine Berechtigung für diese Station' });
        }

        const targetStationId = stationId || req.session.user.station_id;
        if (!targetStationId) {
            return res.status(400).json({ error: 'Keine Station ausgewählt' });
        }
        
        const result = await PushService.sendToStation(targetStationId, title, body, url || '/');
        res.json(result);
    } catch (error) {
        console.error('Push send-station error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
