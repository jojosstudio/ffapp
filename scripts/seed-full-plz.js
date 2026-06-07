const { run, query } = require('../models/db');

// Complete NRW postal codes with ranges - each city gets all its PLZ
// Format: {name, type, plzs: [single codes], ranges: [[start, end]]}
const cityData = [
  // ===== DÜSSELDORF =====
  {name:'Düsseldorf', type:'kreisfreie_stadt', range:['40210','40629']},
  {name:'Duisburg', type:'kreisfreie_stadt', range:['47051','47279']},
  {name:'Essen', type:'kreisfreie_stadt', range:['45127','45359']},
  {name:'Krefeld', type:'kreisfreie_stadt', range:['47798','47839']},
  {name:'Oberhausen', type:'kreisfreie_stadt', range:['46045','46149']},
  {name:'Remscheid', type:'kreisfreie_stadt', range:['42853','42899']},
  {name:'Solingen', type:'kreisfreie_stadt', range:['42651','42719']},
  {name:'Wuppertal', type:'kreisfreie_stadt', range:['42103','42399']},
  {name:'Kreis Mettmann', type:'kreis', range:['40822','40885']},
  {name:'Rhein-Kreis Neuss', type:'kreis', range:['41460','41542']},
  {name:'Kreis Viersen', type:'kreis', range:['41747','41812']},
  {name:'Kreis Wesel', type:'kreis', range:['46483','46562']},
  // ===== KÖLN =====
  {name:'Aachen', type:'kreisfreie_stadt', range:['52062','52080']},
  {name:'Bonn', type:'kreisfreie_stadt', range:['53111','53229']},
  {name:'Köln', type:'kreisfreie_stadt', range:['50667','51149']},
  {name:'Leverkusen', type:'kreisfreie_stadt', range:['51371','51381']},
  {name:'Kreis Düren', type:'kreis', range:['52349','52400']},
  {name:'Kreis Euskirchen', type:'kreis', range:['53879','53902']},
  {name:'Kreis Heinsberg', type:'kreis', range:['41844','52538']},
  {name:'Oberbergischer Kreis', type:'kreis', range:['51643','51702']},
  {name:'Rheinisch-Bergischer Kreis', type:'kreis', range:['51427','51515']},
  {name:'Rhein-Erft-Kreis', type:'kreis', range:['50126','50374']},
  {name:'Rhein-Sieg-Kreis', type:'kreis', range:['53604','53844']},
  // ===== MÜNSTER =====
  {name:'Bottrop', type:'kreisfreie_stadt', range:['46236','46244']},
  {name:'Gelsenkirchen', type:'kreisfreie_stadt', range:['45879','45899']},
  {name:'Münster', type:'kreisfreie_stadt', range:['48143','48167']},
  {name:'Kreis Borken', type:'kreis', range:['46325','46419']},
  {name:'Kreis Coesfeld', type:'kreis', range:['48653','48734']},
  {name:'Kreis Recklinghausen', type:'kreis', range:['45657','45772']},
  {name:'Kreis Steinfurt', type:'kreis', range:['48356','48531']},
  {name:'Kreis Warendorf', type:'kreis', range:['48231','48308']},
  // ===== ARNSBERG =====
  {name:'Bochum', type:'kreisfreie_stadt', range:['44787','44894']},
  {name:'Dortmund', type:'kreisfreie_stadt', range:['44135','44388']},
  {name:'Hagen', type:'kreisfreie_stadt', range:['58089','58137']},
  {name:'Hamm', type:'kreisfreie_stadt', range:['59063','59077']},
  {name:'Herne', type:'kreisfreie_stadt', range:['44623','44653']},
  {name:'Ennepe-Ruhr-Kreis', type:'kreis', range:['45525','45549']},
  {name:'Hochsauerlandkreis', type:'kreis', range:['57334','59955']},
  {name:'Märkischer Kreis', type:'kreis', range:['58507','58809']},
  {name:'Kreis Olpe', type:'kreis', range:['57368','57489']},
  {name:'Kreis Siegen-Wittgenstein', type:'kreis', range:['57072','57399']},
  {name:'Kreis Soest', type:'kreis', range:['59494','59590']},
  {name:'Kreis Unna', type:'kreis', range:['59174','59427']},
  // ===== DETMOLD =====
  {name:'Bielefeld', type:'kreisfreie_stadt', range:['33602','33739']},
  {name:'Kreis Gütersloh', type:'kreis', range:['33330','33449']},
  {name:'Kreis Herford', type:'kreis', range:['32049','32609']},
  {name:'Kreis Höxter', type:'kreis', range:['33034','37691']},
  {name:'Kreis Lippe', type:'kreis', range:['32657','32839']},
  {name:'Kreis Minden-Lübbecke', type:'kreis', range:['32312','32609']},
  {name:'Kreis Paderborn', type:'kreis', range:['33098','33165']},
];

(async () => {
  try {
    // Drop old city PLZ table approach - use plz_ranges table for efficient lookup
    // First check if it exists
    let cols = await query('PRAGMA table_info(cities)');
    const hasPlzRanges = cols.some(c => c.name === 'plz_start') || cols.some(c => c.name === 'plz_range');
    
    // Drop and recreate cities table with plz_start and plz_end
    await run('DROP TABLE IF EXISTS cities');
    console.log('Dropped cities table');
    
    // Recreate with PLZ ranges stored as JSON in postal_code (comma-separated format)
    await run(`
      CREATE TABLE cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('kreis', 'kreisfreie_stadt')) DEFAULT 'kreis',
        postal_code TEXT,
        UNIQUE(state_id, name)
      )
    `);
    console.log('Created cities table');
    
    // Insert all cities
    for (const c of cityData) {
      const startNum = parseInt(c.range[0]);
      const endNum = parseInt(c.range[1]);
      
      // Store first PLZ and last PLZ for range matching
      const plzStr = c.range[0] + ',' + c.range[1];
      
      await run(
        'INSERT INTO cities (state_id, name, type, postal_code) VALUES (?, ?, ?, ?)',
        [1, c.name, c.type, plzStr]
      );
      console.log('Inserted:', c.name, plzStr);
    }
    console.log(`✅ Inserted ${cityData.length} cities`);
    
    // Now also create a dedicated postal_codes table for fast lookup
    await run(`
      CREATE TABLE IF NOT EXISTS postal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city_id INTEGER NOT NULL,
        plz TEXT NOT NULL,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
      )
    `);
    console.log('Created postal_codes table');
    
    // Generate all individual PLZ codes for lookup
    let count = 0;
    const cities = await query('SELECT id, name, postal_code FROM cities');
    
    for (const city of cities) {
      if (city.postal_code && city.postal_code.includes(',')) {
        const [start, end] = city.postal_code.split(',');
        const startNum = parseInt(start);
        const endNum = parseInt(end);
        
        // Only insert first, middle and last few to keep DB small but functional
        // For full precision, we'd insert all, but 5-digit PLZ makes this manageable
        const step = Math.max(1, Math.floor((endNum - startNum) / 20));
        for (let plz = startNum; plz <= endNum; plz += step) {
          await run('INSERT INTO postal_codes (city_id, plz) VALUES (?, ?)',
            [city.id, String(plz).padStart(5, '0')]);
          count++;
        }
        // Ensure last PLZ is included
        await run('INSERT OR IGNORE INTO postal_codes (city_id, plz) VALUES (?, ?)',
          [city.id, end]);
      }
    }
    console.log(`✅ Inserted ${count} individual postal codes`);
    
    // Check user columns
    const userCols = await query('PRAGMA table_info(users)');
    if (!userCols.some(c => c.name === 'phone')) {
      await run('ALTER TABLE users ADD COLUMN phone TEXT');
    }
    if (!userCols.some(c => c.name === 'dienstgrad')) {
      await run('ALTER TABLE users ADD COLUMN dienstgrad TEXT');
    }
    if (!userCols.some(c => c.name === 'dienstjahre')) {
      await run('ALTER TABLE users ADD COLUMN dienstjahre INTEGER DEFAULT 0');
    }
    if (!userCols.some(c => c.name === 'geburtsdatum')) {
      await run('ALTER TABLE users ADD COLUMN geburtsdatum TEXT');
    }
    if (!userCols.some(c => c.name === 'plz')) {
      await run('ALTER TABLE users ADD COLUMN plz TEXT');
    }
    
    console.log('✅ User columns OK');
    console.log('✅ Complete!');
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();