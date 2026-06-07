const { run } = require('../models/db');

const cities = [
  // Düsseldorf area
  {name:'Düsseldorf', type:'kreisfreie_stadt', plz:'40210'},
  {name:'Duisburg', type:'kreisfreie_stadt', plz:'47051'},
  {name:'Essen', type:'kreisfreie_stadt', plz:'45127'},
  {name:'Krefeld', type:'kreisfreie_stadt', plz:'47798'},
  {name:'Oberhausen', type:'kreisfreie_stadt', plz:'46045'},
  {name:'Remscheid', type:'kreisfreie_stadt', plz:'42853'},
  {name:'Solingen', type:'kreisfreie_stadt', plz:'42651'},
  {name:'Wuppertal', type:'kreisfreie_stadt', plz:'42103'},
  {name:'Kreis Mettmann', type:'kreis', plz:'40822'},
  {name:'Rhein-Kreis Neuss', type:'kreis', plz:'41460'},
  {name:'Kreis Viersen', type:'kreis', plz:'41747'},
  {name:'Kreis Wesel', type:'kreis', plz:'46483'},
  // Köln area
  {name:'Aachen', type:'kreisfreie_stadt', plz:'52062'},
  {name:'Bonn', type:'kreisfreie_stadt', plz:'53111'},
  {name:'Köln', type:'kreisfreie_stadt', plz:'50667'},
  {name:'Leverkusen', type:'kreisfreie_stadt', plz:'51373'},
  {name:'Kreis Düren', type:'kreis', plz:'52349'},
  {name:'Kreis Euskirchen', type:'kreis', plz:'53879'},
  {name:'Kreis Heinsberg', type:'kreis', plz:'52525'},
  {name:'Oberbergischer Kreis', type:'kreis', plz:'51643'},
  {name:'Rheinisch-Bergischer Kreis', type:'kreis', plz:'51429'},
  {name:'Rhein-Erft-Kreis', type:'kreis', plz:'50126'},
  {name:'Rhein-Sieg-Kreis', type:'kreis', plz:'53721'},
  // Münster area
  {name:'Bottrop', type:'kreisfreie_stadt', plz:'46236'},
  {name:'Gelsenkirchen', type:'kreisfreie_stadt', plz:'45879'},
  {name:'Münster', type:'kreisfreie_stadt', plz:'48143'},
  {name:'Kreis Borken', type:'kreis', plz:'46325'},
  {name:'Kreis Coesfeld', type:'kreis', plz:'48653'},
  {name:'Kreis Recklinghausen', type:'kreis', plz:'45657'},
  {name:'Kreis Steinfurt', type:'kreis', plz:'48565'},
  {name:'Kreis Warendorf', type:'kreis', plz:'48231'},
  // Arnsberg area
  {name:'Bochum', type:'kreisfreie_stadt', plz:'44787'},
  {name:'Dortmund', type:'kreisfreie_stadt', plz:'44135'},
  {name:'Hagen', type:'kreisfreie_stadt', plz:'58095'},
  {name:'Hamm', type:'kreisfreie_stadt', plz:'59065'},
  {name:'Herne', type:'kreisfreie_stadt', plz:'44623'},
  {name:'Iserlohn', type:'kreisfreie_stadt', plz:'58636'},
  {name:'Ennepe-Ruhr-Kreis', type:'kreis', plz:'58332'},
  {name:'Hochsauerlandkreis', type:'kreis', plz:'59872'},
  {name:'Märkischer Kreis', type:'kreis', plz:'58511'},
  {name:'Kreis Olpe', type:'kreis', plz:'57462'},
  {name:'Kreis Siegen-Wittgenstein', type:'kreis', plz:'57072'},
  {name:'Kreis Soest', type:'kreis', plz:'59494'},
  {name:'Kreis Unna', type:'kreis', plz:'59423'},
  // Detmold area
  {name:'Bielefeld', type:'kreisfreie_stadt', plz:'33602'},
  {name:'Kreis Gütersloh', type:'kreis', plz:'33330'},
  {name:'Kreis Herford', type:'kreis', plz:'32051'},
  {name:'Kreis Höxter', type:'kreis', plz:'37671'},
  {name:'Kreis Lippe', type:'kreis', plz:'32756'},
  {name:'Kreis Minden-Lübbecke', type:'kreis', plz:'32423'},
  {name:'Kreis Paderborn', type:'kreis', plz:'33098'}
];

(async () => {
  // Add postal_code column if not exists
  const { query } = require('../models/db');
  const cols = await query('PRAGMA table_info(cities)');
  if (!cols.some(c => c.name === 'postal_code')) {
    await run('ALTER TABLE cities ADD COLUMN postal_code TEXT');
    console.log('✅ Added postal_code to cities');
  }

  let count = 0;
  for (const c of cities) {
    await run(
      'INSERT OR IGNORE INTO cities (state_id, name, type, postal_code) VALUES (?, ?, ?, ?)',
      [1, c.name, c.type, c.plz]
    );
    count++;
  }
  console.log(`✅ Inserted ${count} cities with postal codes`);
  
  // Add extra fields to users table for zugfuehrer
  const userCols = await query('PRAGMA table_info(users)');
  if (!userCols.some(c => c.name === 'phone')) {
    await run('ALTER TABLE users ADD COLUMN phone TEXT');
    console.log('✅ Added phone to users');
  }
  if (!userCols.some(c => c.name === 'dienstgrad')) {
    await run('ALTER TABLE users ADD COLUMN dienstgrad TEXT');
    console.log('✅ Added dienstgrad to users');
  }
  if (!userCols.some(c => c.name === 'dienstjahre')) {
    await run('ALTER TABLE users ADD COLUMN dienstjahre INTEGER DEFAULT 0');
    console.log('✅ Added dienstjahre to users');
  }
  if (!userCols.some(c => c.name === 'geburtsdatum')) {
    await run('ALTER TABLE users ADD COLUMN geburtsdatum TEXT');
    console.log('✅ Added geburtsdatum to users');
  }
  
  console.log('✅ All done!');
  process.exit(0);
})();