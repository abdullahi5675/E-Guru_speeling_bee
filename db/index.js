const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost')
          ? false
          : { rejectUnauthorized: false }
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jigawa_spelling_bee',
      }
);

// Auto initialize tables
async function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  
  const client = await pool.connect();
  try {
    await client.query(schemaSql);
    console.log('[DB] Database schema verified and initialized.');

    // Check if words exist, if not seed default Jigawa demo words
    const wordsCount = await client.query('SELECT COUNT(*) FROM words');
    if (parseInt(wordsCount.rows[0].count) === 0) {
      console.log('[DB] Seeding official Jigawa Championship words...');
      const demoWords = [
        [1, "ACCOMMODATE", "\\ uh-KOM-uh-deyt \\", "Verb", "Latin", "To provide lodging or sufficient space for; to fit in with the wishes of.", "The Dutse conference hall was large enough to accommodate all visiting contestants.", false],
        [2, "ARCHAEOMETRY", "\\ ahr-kee-OM-i-tree \\", "Noun", "Greek", "The application of scientific techniques to the analysis of archaeological materials.", "The historian used archaeometry to determine the exact age of the ancient Nok artefacts.", false],
        [3, "CONSCIENTIOUS", "\\ kon-shee-EN-shuhs \\", "Adjective", "Latin", "Wishing to do what is right, especially to do one's work or duty well and thoroughly.", "Amina was a conscientious student who prepared diligently for the state finals.", false],
        [4, "EMBARRASSMENT", "\\ em-BAR-uhs-muhnt \\", "Noun", "French", "A feeling of self-consciousness, shame, or awkwardness.", "He spelled the difficult word without a trace of hesitation or embarrassment.", false],
        [5, "KALEIDOSCOPE", "\\ kuh-LY-duh-skohp \\", "Noun", "Greek", "A constantly changing pattern or sequence of elements; an optical instrument.", "The cultural day at Hadejia showcased a rich kaleidoscope of traditional attires.", false],
        [6, "PNEUMONIA", "\\ noo-MOHN-yuh \\", "Noun", "Greek", "Lung inflammation caused by bacterial or viral infection.", "The state health clinic in Kazaure treated several children for severe pneumonia.", false],
        [7, "SOVEREIGNTY", "\\ SOV-ruhn-tee \\", "Noun", "Old French", "Supreme power or authority; the authority of a state to govern itself.", "Every nation fiercely defends its territorial integrity and sovereignty.", false],
        [8, "XEROGRAPHY", "\\ zee-ROG-ruh-fee \\", "Noun", "Greek", "A dry photocopying process in which an electrostatically charged plate is used.", "Modern photocopiers utilize xerography to duplicate documents in seconds.", false],
        [9, "MALLEABLE", "\\ MAL-ee-uh-buhl \\", "Adjective", "Latin", "Able to be hammered or pressed permanently out of shape without breaking.", "Gold and copper are malleable metals widely prized by traditional blacksmiths.", false],
        [10, "SURVEILLANCE", "\\ ser-VAY-luhns \\", "Noun", "French", "Close observation, especially of a suspected person or area.", "The school premises are monitored by automated surveillance cameras.", false],
        [11, "RHYTHMIC", "\\ RITH-mik \\", "Adjective", "Greek", "Having or relating to a pleasing regular pattern of beats or movements.", "The traditional drum ensemble produced a vibrant and rhythmic melody.", false],
        [12, "ENTREPRENEUR", "\\ ahn-truh-pruh-NUR \\", "Noun", "French", "A person who sets up a business, taking on financial risks in the hope of profit.", "The young entrepreneur established a technology hub in Dutse.", false],
        [13, "IDIOSYNCRASY", "\\ id-ee-oh-SING-kruh-see \\", "Noun", "Greek", "A mode of behavior or way of thought peculiar to an individual.", "One endearing idiosyncrasy of the headmaster was tapping his desk before speaking.", false],
        [14, "CARCINOMATOSIS", "\\ kahr-sin-oh-muh-TOH-sis \\", "Noun", "Greek", "A condition in which multiple carcinomas develop throughout the body.", "The oncologist reviewed the biopsy results to rule out carcinomatosis.", false],
        [15, "GLYCOBIOLOGY", "\\ gly-koh-by-OL-uh-jee \\", "Noun", "Greek", "The study of the structure, biosynthesis, and biology of saccharides.", "Her postgraduate research at the university focused on molecular glycobiology.", false]
      ];

      for (const w of demoWords) {
        await client.query(
          `INSERT INTO words (question_num, word, phonetic, pos, origin, definition, sentence, is_used)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
          w
        );
      }
    }

    // Check if students exist, if not seed default Jigawa schools & spellers
    const studentsCount = await client.query('SELECT COUNT(*) FROM students');
    if (parseInt(studentsCount.rows[0].count) === 0) {
      console.log('[DB] Seeding official Jigawa Contestant roster...');
      const demoStudents = [
        [1, "Benjamin Umar", "Government Science Academy", "Dutse", "Senior", true, {}, 0, 0],
        [2, "Fatima Aliyu", "Federal Government Girls College", "Kazaure", "Senior", true, {}, 0, 0],
        [3, "Ibrahim Mustapha", "Government College", "Birnin Kudu", "Senior", true, {}, 0, 0],
        [4, "Zainab Sani", "Government Commercial Secondary School", "Hadejia", "Senior", true, {}, 0, 0],
        [5, "Kabiru Hassan", "Gumel Science Secondary School", "Gumel", "Senior", true, {}, 0, 0],
        [6, "Maryam Bello", "Government Girls Unity Secondary School", "Ringim", "Senior", true, {}, 0, 0],
        [7, "Usman Danladi", "Capital Science Academy", "Dutse", "Junior", true, {}, 0, 0],
        [8, "Aisha Mohammed", "Model Junior Secondary School", "Hadejia", "Junior", true, {}, 0, 0]
      ];

      for (const s of demoStudents) {
        await client.query(
          `INSERT INTO students (id, name, school, lga, category, is_alive, scores, correct_count, total_points)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
          s
        );
      }

      // Update state with active speller and question
      await client.query(`
        UPDATE competition_state
        SET active_speller_id = 1, active_question_num = 1
        WHERE id = 1
      `);
    }

  } catch (err) {
    console.error('[DB] Error initializing database tables:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

const STAGE_RULES = {
  1: {
    name: 'Preliminary / Knockout',
    advanceCount: 10,
    dropCount: 8,
    format: 'qualification',
    description: 'Stage 1: Top 10 by marks advance to Quarter-Final (8 dropped)'
  },
  2: {
    name: 'Quarter-Final',
    advanceCount: 5,
    dropCount: 5,
    format: 'qualification',
    description: 'Stage 2: Top 5 by marks advance to Semi-Final (5 dropped)'
  },
  3: {
    name: 'Semi-Final',
    advanceCount: 3,
    dropCount: 2,
    format: 'qualification',
    description: 'Stage 3: Top 3 by marks advance to Grand Final (2 dropped)'
  },
  4: {
    name: 'Grand Final',
    advanceCount: null,
    dropCount: null,
    format: 'knockout',
    description: 'Grand Final: Sudden Death Knockout • Miss a word and you are out'
  }
};
const ROUND_RULES = STAGE_RULES;

// Queries
async function getFullState() {
  const client = await pool.connect();
  try {
    const stateRes = await client.query('SELECT * FROM competition_state WHERE id = 1');
    const wordsRes = await client.query('SELECT * FROM words ORDER BY question_num ASC');
    const studentsRes = await client.query('SELECT * FROM students ORDER BY id ASC');
    const historyRes = await client.query('SELECT * FROM adjudication_history ORDER BY id DESC LIMIT 50');
    const statsRes = await client.query(`
      SELECT 
        student_id,
        round,
        COUNT(*)::int as attempts,
        COUNT(*) FILTER (WHERE result = 'correct')::int as correct
      FROM adjudication_history
      GROUP BY student_id, round
    `);

    const statsMap = {};
    statsRes.rows.forEach(r => {
      if (!statsMap[r.student_id]) statsMap[r.student_id] = {};
      statsMap[r.student_id][r.round] = { attempts: r.attempts, correct: r.correct };
    });

    const state = stateRes.rows[0] || {};
    const words = {};
    const usedWordNums = [];
    wordsRes.rows.forEach(w => {
      words[w.question_num] = {
        num: w.question_num,
        word: w.word,
        phonetic: w.phonetic,
        pos: w.pos,
        origin: w.origin,
        def: w.definition,
        sentence: w.sentence,
        used: w.is_used
      };
      if (w.is_used) usedWordNums.push(w.question_num);
    });

    const students = studentsRes.rows.map(s => ({
      id: s.id,
      name: s.name,
      school: s.school,
      lga: s.lga,
      category: s.category,
      alive: s.is_alive,
      scores: s.scores || {},
      correctCount: s.correct_count,
      totalPoints: s.total_points,
      roundStats: statsMap[s.id] || {}
    }));

    const roundHistory = historyRes.rows.map(h => ({
      id: h.id,
      round: h.round,
      spellerId: h.student_id,
      spellerName: h.student_name,
      questionNum: h.question_num,
      word: h.word,
      spelled: h.spelled_letters,
      result: h.result,
      timestamp: new Date(h.created_at).getTime()
    }));

    const currentRule = STAGE_RULES[state.round] || STAGE_RULES[4];

    return {
      title: state.title,
      subtitle: state.subtitle,
      round: state.round,
      stage: state.round,
      stageName: currentRule.name,
      stageFormat: currentRule.format,
      roundFormat: currentRule.format,
      currentRule,
      currentStageRule: currentRule,
      roundRules: STAGE_RULES,
      stageRules: STAGE_RULES,
      stageConfig: state.stage_config || null,
      timerDuration: (state.timer_duration > 300) ? 60 : state.timer_duration,
      timerWarning: state.timer_warning,
      pointsPerWord: Number(state.points_per_word) || 25,
      stageWordLimit: state.stage_word_limit || 4,
      decisionLocked: Boolean(state.decision_locked),
      timerStartedForTurn: Boolean(state.timer_started_for_turn),
      tiebreakerActive: Boolean(state.tiebreaker_active),
      tiebreakerData: state.tiebreaker_data || {},
      stageRevealMode: state.stage_reveal_mode,
      stageWordRevealed: state.stage_word_revealed,
      activeSpellerId: state.active_speller_id,
      activeQuestionNum: state.active_question_num,
      currentSpelling: state.current_spelling,
      adjudicationResult: state.adjudication_result,
      timerEnd: Number(state.timer_end),
      timerRunning: state.timer_running,
      timerPausedRemaining: (state.timer_paused_remaining > 300) ? null : state.timer_paused_remaining,
      serverTime: Date.now(),   // ← clients use this to correct their clock skew
      words,
      usedWordNums,
      students,
      roundHistory
    };
  } finally {
    client.release();
  }
}

async function updateState(fields) {
  const client = await pool.connect();
  try {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const k of keys) {
      setClauses.push(`${k} = $${idx}`);
      values.push(fields[k]);
      idx++;
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    const sql = `UPDATE competition_state SET ${setClauses.join(', ')} WHERE id = 1`;
    await client.query(sql, values);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  getFullState,
  updateState,
  STAGE_RULES,
  ROUND_RULES
};
