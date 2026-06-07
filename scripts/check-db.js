const { query } = require('../models/db');
(async () => {
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.map(t => t.name));
  
  const cities = await query('SELECT COUNT(*) as count FROM cities');
  console.log('Cities count:', cities[0].count);
  
  const cols = await query('PRAGMA table_info(cities)');
  console.log('City columns:', cols.map(c => c.name));
  
  const userCols = await query('PRAGMA table_info(users)');
  console.log('User columns:', userCols.map(c => c.name));
  
  const states = await query('SELECT * FROM states');
  console.log('States:', states);
  
  const existingCities = await query('SELECT id, name, postal_code FROM cities LIMIT 5');
  console.log('Sample cities:', existingCities);
  
  process.exit(0);
})();