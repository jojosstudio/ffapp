const { run } = require('../models/db');

const questions = [
  {q: 'Was bedeutet die rote Flagge im Feuerwehreinsatz?', a: 'Gefahrenbereich', b: 'Sammelplatz', c: 'Wasserentnahmestelle', d: 'Eingeschränkter Bereich', correct: 0},
  {q: 'Welche Atemschutzgeräte gibt es?', a: 'Filtergeräte', b: 'Isoliergeräte', c: 'Beide', d: 'Keine', correct: 2},
  {q: 'Was ist die erste Maßnahme bei einem Brand?', a: 'Löschen', b: 'Retten', c: 'Belüften', d: 'Melden', correct: 1},
  {q: 'Welche Löschklasse hat brennbare Flüssigkeiten?', a: 'Klasse A', b: 'Klasse B', c: 'Klasse C', d: 'Klasse D', correct: 1},
  {q: 'Was bedeutet der Begriff FwDV?', a: 'Feuerwehr-Dienstverordnung', b: 'Feuerwehr-Dienstvorschrift', c: 'Feuerwehr-Dienstvertrag', d: 'Feuerwehr-Dienstverband', correct: 1}
];

(async () => {
  for (const q of questions) {
    await run(
      'INSERT INTO quiz_questions (challenge_id, question, option_a, option_b, option_c, option_d, correct_answer) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, q.q, q.a, q.b, q.c, q.d, q.correct]
    );
    console.log('Added:', q.q.substring(0, 40));
  }
  console.log('Done - 5 questions added');
})();