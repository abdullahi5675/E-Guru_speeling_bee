const { pool } = require('./db');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function import500Words() {
  const jsonPath = path.join(__dirname, 'db', 'jss_500_words.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('File not found:', jsonPath);
    return;
  }

  const words = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${words.length} words from jss_500_words.json`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear old sample words
    await client.query('TRUNCATE TABLE words RESTART IDENTITY CASCADE');

    for (const item of words) {
      await client.query(
        `INSERT INTO words (question_num, word, phonetic, pos, origin, definition, sentence, is_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
        [
          item.num,
          item.word,
          `\\ ${item.word.toLowerCase()} \\`,
          item.pos,
          item.origin,
          item.def,
          item.sentence
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Successfully imported all ${words.length} official J-YEDA competition words into PostgreSQL!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

import500Words();
