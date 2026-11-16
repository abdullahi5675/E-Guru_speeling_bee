// ================================================================
// E-GURU SPELLING BEE — SaaS Organization & Auth Module
// Handles: registration, login, session, org-scoped DB queries
// ================================================================
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'eguru-spelling-bee-saas-secret-2025';

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

// ── Apply SaaS schema migrations ──
async function initSaasSchema() {
  const schemaPath = path.join(__dirname, 'saas_schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[SAAS] Multi-tenant schema verified.');
  } catch (err) {
    console.error('[SAAS] Schema error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ── Helpers ──
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let attempt = slug;
  let n = 1;
  while (true) {
    const { rows } = await pool.query('SELECT id FROM organizations WHERE slug = $1', [attempt]);
    if (rows.length === 0) return attempt;
    attempt = `${slug}-${n++}`;
  }
}

// ── Registration ──
async function registerOrg({ name, email, password, contactName, contactPhone, location }) {
  if (!name || !email || !password) throw new Error('Name, email and password are required.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  // Check email not already used
  const existing = await pool.query('SELECT id FROM organizations WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) throw new Error('An account with this email already exists.');

  const hash = await bcrypt.hash(password, 12);
  const slug = await uniqueSlug(name);

  const { rows } = await pool.query(
    `INSERT INTO organizations (name, slug, email, password_hash, contact_name, contact_phone, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, slug, email, created_at`,
    [name, slug, email.toLowerCase(), hash, contactName || null, contactPhone || null, location || null]
  );
  const org = rows[0];

  // Auto-create org's competition state
  await pool.query(
    `INSERT INTO org_competition_state (org_id, title, subtitle)
     VALUES ($1, $2, $3) ON CONFLICT (org_id) DO NOTHING`,
    [org.id, `${name} Spelling Bee Championship`, `Powered by E-Guru Spelling Bee Platform`]
  );

  const token = jwt.sign({ orgId: org.id, slug: org.slug }, JWT_SECRET, { expiresIn: '7d' });

  // Store session
  await pool.query(
    `INSERT INTO org_sessions (org_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [org.id, token]
  );

  return { org, token };
}

// ── Login ──
async function loginOrg({ email, password }) {
  if (!email || !password) throw new Error('Email and password are required.');

  const { rows } = await pool.query(
    'SELECT * FROM organizations WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );
  if (rows.length === 0) throw new Error('Invalid email or password.');

  const org = rows[0];
  const valid = await bcrypt.compare(password, org.password_hash);
  if (!valid) throw new Error('Invalid email or password.');

  const token = jwt.sign({ orgId: org.id, slug: org.slug }, JWT_SECRET, { expiresIn: '7d' });

  // Revoke old sessions, store new
  await pool.query('DELETE FROM org_sessions WHERE org_id = $1', [org.id]);
  await pool.query(
    `INSERT INTO org_sessions (org_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [org.id, token]
  );

  return {
    org: { id: org.id, name: org.name, slug: org.slug, email: org.email, logoUrl: org.logo_url, plan: org.plan },
    token
  };
}

// ── Verify Token Middleware ──
async function requireOrgAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const cookie = req.headers.cookie || '';
    let token = null;

    if (auth.startsWith('Bearer ')) token = auth.slice(7);
    else {
      const match = cookie.match(/eguru_token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) return res.status(401).json({ error: 'Not authenticated. Please log in.' });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    // Confirm session in DB
    const { rows } = await pool.query(
      'SELECT * FROM org_sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    // Fetch org
    const orgRes = await pool.query('SELECT id, name, slug, email, logo_url, plan FROM organizations WHERE id = $1 AND is_active = true', [payload.orgId]);
    if (orgRes.rows.length === 0) return res.status(403).json({ error: 'Organization not found or disabled.' });

    req.org = orgRes.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth error: ' + err.message });
  }
}

// ── Org-scoped competition state ──
const ORG_STAGE_RULES = {
  1: { name: 'Preliminary / Knockout', advanceCount: 10, dropCount: 8, format: 'qualification', description: 'Stage 1: Top 10 by marks advance to Quarter-Final' },
  2: { name: 'Quarter-Final', advanceCount: 5, dropCount: 5, format: 'qualification', description: 'Stage 2: Top 5 by marks advance to Semi-Final' },
  3: { name: 'Semi-Final', advanceCount: 3, dropCount: 2, format: 'qualification', description: 'Stage 3: Top 3 by marks advance to Grand Final' },
  4: { name: 'Grand Final', advanceCount: null, dropCount: null, format: 'knockout', description: 'Grand Final: Sudden Death Knockout' }
};

async function getOrgFullState(orgId) {
  const client = await pool.connect();
  try {
    const stateRes = await client.query('SELECT * FROM org_competition_state WHERE org_id = $1', [orgId]);
    const wordsRes = await client.query('SELECT * FROM org_words WHERE org_id = $1 ORDER BY question_num ASC', [orgId]);
    const studentsRes = await client.query('SELECT * FROM org_students WHERE org_id = $1 ORDER BY contestant_num ASC', [orgId]);
    const historyRes = await client.query('SELECT * FROM org_adjudication_history WHERE org_id = $1 ORDER BY id DESC LIMIT 50', [orgId]);
    const statsRes = await client.query(`
      SELECT student_id, round,
        COUNT(*)::int as attempts,
        COUNT(*) FILTER (WHERE result = 'correct')::int as correct
      FROM org_adjudication_history WHERE org_id = $1
      GROUP BY student_id, round
    `, [orgId]);

    // If no state row yet, create one
    let state = stateRes.rows[0];
    if (!state) {
      const orgRes = await client.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
      const orgName = orgRes.rows[0]?.name || 'Spelling Bee';
      await client.query(
        `INSERT INTO org_competition_state (org_id, title, subtitle) VALUES ($1, $2, $3) ON CONFLICT (org_id) DO NOTHING`,
        [orgId, `${orgName} Spelling Bee Championship`, 'Powered by E-Guru Platform']
      );
      const refetch = await client.query('SELECT * FROM org_competition_state WHERE org_id = $1', [orgId]);
      state = refetch.rows[0];
    }

    const statsMap = {};
    statsRes.rows.forEach(r => {
      if (!statsMap[r.student_id]) statsMap[r.student_id] = {};
      statsMap[r.student_id][r.round] = { attempts: r.attempts, correct: r.correct };
    });

    const words = {};
    const usedWordNums = [];
    wordsRes.rows.forEach(w => {
      words[w.question_num] = { num: w.question_num, word: w.word, phonetic: w.phonetic, pos: w.pos, origin: w.origin, def: w.definition, sentence: w.sentence, used: w.is_used };
      if (w.is_used) usedWordNums.push(w.question_num);
    });

    const students = studentsRes.rows.map(s => ({
      id: s.contestant_num,
      dbId: s.id,
      name: s.name,
      school: s.school,
      lga: s.zone,
      category: s.category,
      alive: s.is_alive,
      scores: s.scores || {},
      correctCount: s.correct_count,
      totalPoints: s.total_points,
      roundStats: statsMap[s.contestant_num] || {}
    }));

    const roundHistory = historyRes.rows.map(h => ({
      id: h.id, round: h.round, spellerId: h.student_id, spellerName: h.student_name,
      questionNum: h.question_num, word: h.word, spelled: h.spelled_letters,
      result: h.result, timestamp: new Date(h.created_at).getTime()
    }));

    const currentRule = ORG_STAGE_RULES[state.round] || ORG_STAGE_RULES[4];

    return {
      title: state.title, subtitle: state.subtitle,
      round: state.round, stage: state.round,
      stageName: currentRule.name, stageFormat: currentRule.format, roundFormat: currentRule.format,
      currentRule, currentStageRule: currentRule, roundRules: ORG_STAGE_RULES, stageRules: ORG_STAGE_RULES,
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
      serverTime: Date.now(),
      words, usedWordNums, students, roundHistory
    };
  } finally {
    client.release();
  }
}

async function updateOrgState(orgId, fields) {
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
    values.push(orgId);
    await client.query(
      `UPDATE org_competition_state SET ${setClauses.join(', ')} WHERE org_id = $${idx}`,
      values
    );
  } finally {
    client.release();
  }
}

async function getOrgBySlug(slug) {
  const { rows } = await pool.query('SELECT id, name, slug, email, logo_url, plan, contact_name, location FROM organizations WHERE slug = $1 AND is_active = true', [slug]);
  return rows[0] || null;
}

module.exports = {
  pool,
  initSaasSchema,
  registerOrg,
  loginOrg,
  requireOrgAuth,
  getOrgFullState,
  updateOrgState,
  getOrgBySlug,
  ORG_STAGE_RULES
};
