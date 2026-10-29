const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
require('dotenv').config();

const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Never cache HTML pages or real-time competition API state
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0
}));

// Explicit page routes for each screen
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/judge', (req, res) => res.sendFile(path.join(__dirname, 'public', 'judge.html')));
app.get('/control', (req, res) => res.redirect('/judge'));
app.get('/projector', (req, res) => res.sendFile(path.join(__dirname, 'public', 'projector.html')));
app.get('/stage', (req, res) => res.redirect('/projector'));
app.get('/speller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'speller.html')));
app.get('/participant', (req, res) => res.redirect('/speller'));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/tiebreaker', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tiebreaker.html')));

// Helper to broadcast state to all screens
async function broadcastState() {
  try {
    const fullState = await db.getFullState();
    io.emit('STATE_UPDATE', fullState);
    return fullState;
  } catch (err) {
    console.error('[SERVER] Broadcast error:', err.message);
  }
}

// REST API
app.get('/api/state', async (req, res) => {
  try {
    const state = await db.getFullState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FULL RESET: wipe all history, scores, used-words and return to Round 1 ──
app.post('/api/reset/full', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM adjudication_history');
    await client.query('UPDATE words SET is_used = false');
    await client.query(`
      UPDATE students
      SET correct_count = 0,
          total_points  = 0,
          scores        = '{}'::jsonb,
          is_alive      = true
    `);
    await client.query(`
      UPDATE competition_state
      SET round                = 1,
          round_format         = 'qualification',
          active_speller_id    = (SELECT id FROM students ORDER BY id ASC LIMIT 1),
          active_question_num  = 1,
          current_spelling     = '',
          adjudication_result  = NULL,
          stage_word_revealed  = false,
          decision_locked      = false,
          stage_word_limit     = 4,
          points_per_word      = 25,
          timer_running        = false,
          timer_end            = 0,
          timer_paused_remaining = NULL
      WHERE id = 1
    `);
    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, message: 'Full reset complete — back to Stage 1 with 25 marks/word', state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Reset error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── ROUND RESET: clear only the current round's history/words, keep others ──
app.post('/api/reset/round', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const stateRes = await client.query('SELECT round FROM competition_state WHERE id = 1');
    const currentRound = stateRes.rows[0]?.round || 1;

    // Q range for this round
    const minQ = currentRound === 1 ? 1   : (currentRound === 2 ? 101 : (currentRound === 3 ? 201 : 301));
    const maxQ = currentRound === 1 ? 100 : (currentRound === 2 ? 200 : (currentRound === 3 ? 300 : 400));

    await client.query('BEGIN');
    // Delete history for this round only
    await client.query('DELETE FROM adjudication_history WHERE round = $1', [currentRound]);
    // Un-use only this round's words
    await client.query('UPDATE words SET is_used = false WHERE question_num BETWEEN $1 AND $2', [minQ, maxQ]);
    // Reset student scores for this round only (keep other rounds intact)
    const studentsRes = await client.query('SELECT id, scores, correct_count FROM students');
    for (const s of studentsRes.rows) {
      const scores = s.scores || {};
      delete scores[currentRound];
      const newTotal = Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0);
      await client.query(
        'UPDATE students SET scores = $1, correct_count = 0, total_points = $2, is_alive = true WHERE id = $3',
        [scores, newTotal, s.id]
      );
    }
    // Reset competition state for this round
    await client.query(`
      UPDATE competition_state
      SET active_speller_id   = (SELECT id FROM students WHERE is_alive = true ORDER BY id ASC LIMIT 1),
          active_question_num = $1,
          current_spelling    = '',
          adjudication_result = NULL,
          stage_word_revealed = false,
          decision_locked     = false,
          timer_running       = false,
          timer_end           = 0,
          timer_paused_remaining = NULL
      WHERE id = 1
    `, [minQ]);
    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, message: `Stage ${currentRound} cleared — ready to replay`, state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Round reset error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Adjudication & Timer actions
app.post('/api/action', async (req, res) => {
  const { action, payload } = req.body;
  const client = await db.pool.connect();

  try {
    const stateRes = await client.query('SELECT * FROM competition_state WHERE id = 1');
    const state = stateRes.rows[0];

    if (action === 'START_TIMER') {
      let dur = state.timer_paused_remaining !== null ? state.timer_paused_remaining : state.timer_duration;
      // Sanitize timer: prevent 5000s bug
      if (dur > 300) {
        dur = dur >= 1000 ? Math.round(dur / 1000) : 60;
      }
      dur = Math.max(5, Math.min(300, dur || 60));
      const timerEnd = Date.now() + (dur * 1000);
      await client.query(`
        UPDATE competition_state
        SET timer_end = $1, timer_running = true, timer_paused_remaining = NULL, timer_started_for_turn = true
        WHERE id = 1
      `, [timerEnd]);
    } 
    else if (action === 'PAUSE_TIMER') {
      if (state.timer_running) {
        const remaining = Math.max(0, Math.ceil((Number(state.timer_end) - Date.now()) / 1000));
        await client.query(`
          UPDATE competition_state
          SET timer_running = false, timer_end = 0, timer_paused_remaining = $1
          WHERE id = 1
        `, [remaining]);
      }
    } 
    else if (action === 'RESET_TIMER') {
      await client.query(`
        UPDATE competition_state
        SET timer_running = false, timer_end = 0, timer_paused_remaining = NULL, timer_started_for_turn = false
        WHERE id = 1
      `);
    } 
    else if (action === 'PLUS_30_SEC') {
      let cur = state.timer_duration;
      if (cur > 300) cur = cur >= 1000 ? Math.round(cur / 1000) : 60;
      if (state.timer_running && Number(state.timer_end) > 0) {
        cur = Math.max(0, Math.ceil((Number(state.timer_end) - Date.now()) / 1000));
      } else if (state.timer_paused_remaining !== null) {
        cur = state.timer_paused_remaining;
      }
      const next = Math.min(300, cur + 30);
      if (state.timer_running) {
        const newEnd = Date.now() + (next * 1000);
        await client.query(`UPDATE competition_state SET timer_end = $1 WHERE id = 1`, [newEnd]);
      } else {
        await client.query(`UPDATE competition_state SET timer_paused_remaining = $1 WHERE id = 1`, [next]);
      }
    }
    else if (action === 'UPDATE_SPELLING') {
      const spelled = (payload?.spelling || '').toUpperCase();
      await client.query(`UPDATE competition_state SET current_spelling = $1 WHERE id = 1`, [spelled]);
    }
    else if (action === 'TOGGLE_STAGE_REVEAL') {
      const nextVal = !state.stage_word_revealed;
      await client.query(`UPDATE competition_state SET stage_word_revealed = $1 WHERE id = 1`, [nextVal]);
    }
    else if (action === 'SELECT_SPELLER') {
      const sid = parseInt(payload?.studentId, 10);
      if (!sid || isNaN(sid)) {
        return res.status(400).json({ error: 'Invalid studentId: ' + payload?.studentId });
      }
      await client.query(`
        UPDATE competition_state
        SET active_speller_id = $1, current_spelling = '', adjudication_result = NULL, stage_word_revealed = false, decision_locked = false, timer_started_for_turn = false
        WHERE id = 1
      `, [sid]);
    }
    else if (action === 'SELECT_QUESTION') {
      const qNum = parseInt(payload?.questionNum, 10);
      if (!qNum || isNaN(qNum)) {
        return res.status(400).json({ error: 'Invalid questionNum: ' + payload?.questionNum });
      }
      await client.query(`
        UPDATE competition_state
        SET active_question_num = $1, current_spelling = '', adjudication_result = NULL, stage_word_revealed = false, decision_locked = false, timer_started_for_turn = false
        WHERE id = 1
      `, [qNum]);
    }
    else if (action === 'MARK_DECISION') {
      const isTimeout = payload?.isTimeout === true;

      // 1. Single click validation & lock
      if (state.decision_locked) {
        return res.status(400).json({ error: 'Decision already recorded for this turn. Click Next Speller to proceed.' });
      }

      // 2. Input validation:
      // If manually clicked by judge during active time, letters must be typed before recording.
      // If time ran out (isTimeout=true), an empty spelling is completely valid and grades as incorrect.
      const spelled = (state.current_spelling || '').trim();
      if (!isTimeout && spelled.length === 0) {
        return res.status(400).json({ error: 'Contestant must spell the word before recording a decision.' });
      }

      // 3. Timer validation: time must have been started
      const timerHasRun = state.timer_started_for_turn || state.timer_running || Number(state.timer_end) > 0 || state.timer_paused_remaining !== null;
      if (!timerHasRun) {
        return res.status(400).json({ error: 'Countdown timer must be started before recording a decision.' });
      }

      let isCorrect = payload?.isCorrect === true;
      const sid = state.active_speller_id;
      const qNum = state.active_question_num;
      const currentRound = state.round;
      const pts = Number(state.points_per_word || 25);

      // Fetch student
      const studentRes = await client.query('SELECT * FROM students WHERE id = $1', [sid]);
      const wordRes = await client.query('SELECT * FROM words WHERE question_num = $1', [qNum]);
      const student = studentRes.rows[0];
      const word = wordRes.rows[0];

      // Auto-validate comparison on timeout
      if (isTimeout) {
        const targetClean = (word?.word || '').toUpperCase().replace(/[^A-Z]/g, '');
        const spelledClean = spelled.toUpperCase().replace(/[^A-Z]/g, '');
        isCorrect = targetClean.length > 0 && targetClean === spelledClean;
      }

      if (student) {
        const scores = student.scores || {};
        let newCorrectCount = student.correct_count || 0;
        let isAlive = student.is_alive;

        // Add points accumulated in this stage
        scores[currentRound] = (scores[currentRound] || 0) + (isCorrect ? pts : 0);
        if (isCorrect) {
          newCorrectCount += 1;
        }

        // Insert history record first so we can count total attempts in this stage
        await client.query(`
          INSERT INTO adjudication_history
          (round, student_id, student_name, question_num, word, spelled_letters, result, points_awarded)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          currentRound,
          student.id,
          student.name,
          qNum,
          word ? word.word : (state.current_spelling || 'Unknown'),
          state.current_spelling,
          isCorrect ? 'correct' : 'incorrect',
          isCorrect ? pts : 0
        ]);

        // Stage 4 (Final / Sudden Death): miss a word and you are out!
        // In Stages 1, 2, 3: attempts are UNLIMITED and students stay ALIVE until stage is ended manually
        if (currentRound >= 4 || state.round_format === 'knockout') {
          if (!isCorrect) {
            isAlive = false;
          }
        }

        const totalPoints = Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0);

        // Update student in DB
        await client.query(`
          UPDATE students
          SET scores = $1, correct_count = $2, total_points = $3, is_alive = $4
          WHERE id = $5
        `, [scores, newCorrectCount, totalPoints, isAlive, sid]);

        // Mark word used
        if (qNum) {
          await client.query(`UPDATE words SET is_used = true WHERE question_num = $1`, [qNum]);
        }

        // Update state: lock decision until Next Speller
        await client.query(`
          UPDATE competition_state
          SET adjudication_result = $1, decision_locked = true, timer_running = false, timer_end = 0, timer_paused_remaining = NULL
          WHERE id = 1
        `, [isCorrect ? 'correct' : 'incorrect']);
      }
    }
    else if (action === 'ADVANCE_SPELLER') {
      const maxAttempts = state.stage_word_limit || 4;

      const candRes = await client.query(`
        SELECT s.id, COUNT(h.id)::int as attempts
        FROM students s
        LEFT JOIN adjudication_history h ON s.id = h.student_id AND h.round = $1
        WHERE s.is_alive = true
        GROUP BY s.id
        HAVING COUNT(h.id) < $2
        ORDER BY attempts ASC, s.id ASC
        LIMIT 1
      `, [state.round, maxAttempts]);

      let nextSid = candRes.rows[0]?.id;
      if (!nextSid) {
        // Fallback: any active student who is not the current speller (if possible)
        const anyActive = await client.query(`
          SELECT id FROM students 
          WHERE is_alive = true AND id != COALESCE($1, 0)
          ORDER BY id ASC LIMIT 1
        `, [state.active_speller_id]);
        nextSid = anyActive.rows[0]?.id || state.active_speller_id;
      }

      // Pick next unused question appropriate for current stage
      const minQ = state.round === 1 ? 1 : (state.round === 2 ? 101 : (state.round === 3 ? 201 : (state.round === 4 ? 301 : 401)));
      const maxQ = state.round === 1 ? 100 : (state.round === 2 ? 200 : (state.round === 3 ? 300 : (state.round === 4 ? 400 : 500)));

      const unusedWordRes = await client.query(`
        SELECT question_num FROM words
        WHERE is_used = false AND question_num BETWEEN $1 AND $2
        ORDER BY question_num ASC LIMIT 1
      `, [minQ, maxQ]);

      let nextQNum = unusedWordRes.rows[0]?.question_num;
      if (!nextQNum) {
        const anyUnused = await client.query(`SELECT question_num FROM words WHERE is_used = false ORDER BY question_num ASC LIMIT 1`);
        nextQNum = anyUnused.rows[0]?.question_num || null;
      }

      await client.query(`
        UPDATE competition_state
        SET active_speller_id = $1, active_question_num = $2, current_spelling = '',
            adjudication_result = NULL, stage_word_revealed = false,
            decision_locked = false, timer_started_for_turn = false,
            timer_running = false, timer_end = 0, timer_paused_remaining = NULL
        WHERE id = 1
      `, [nextSid, nextQNum]);
    }
    else if (action === 'START_NEXT_ATTEMPT_CYCLE') {
      const minQ = state.round === 1 ? 1 : (state.round === 2 ? 101 : (state.round === 3 ? 201 : (state.round === 4 ? 301 : 401)));
      const maxQ = state.round === 1 ? 100 : (state.round === 2 ? 200 : (state.round === 3 ? 300 : (state.round === 4 ? 400 : 500)));

      const firstActive = await client.query('SELECT id FROM students WHERE is_alive = true ORDER BY id ASC LIMIT 1');
      const nextSid = firstActive.rows[0]?.id || state.active_speller_id;

      const unusedWordRes = await client.query(`
        SELECT question_num FROM words
        WHERE is_used = false AND question_num BETWEEN $1 AND $2
        ORDER BY question_num ASC LIMIT 1
      `, [minQ, maxQ]);

      const nextQNum = unusedWordRes.rows[0]?.question_num || minQ;

      await client.query(`
        UPDATE competition_state
        SET active_speller_id = $1, active_question_num = $2, current_spelling = '',
            adjudication_result = NULL, stage_word_revealed = false,
            decision_locked = false, timer_started_for_turn = false,
            timer_running = false, timer_end = 0, timer_paused_remaining = NULL
        WHERE id = 1
      `, [nextSid, nextQNum]);
    }
    else if (action === 'ADVANCE_ROUND' || action === 'ADVANCE_STAGE') {
      const prevRound = state.round;
      const nextRound = state.round + 1;

      // When concluding previous round, enforce qualifiers threshold:
      if (prevRound === 1) {
        await client.query(`
          UPDATE students s
          SET is_alive = false
          WHERE is_alive = true AND (
            SELECT COUNT(*) FROM adjudication_history h
            WHERE h.student_id = s.id AND h.round = 1 AND h.result = 'correct'
          ) < 3
        `);
      } else if (prevRound === 2) {
        await client.query(`
          UPDATE students s
          SET is_alive = false
          WHERE is_alive = true AND (
            SELECT COUNT(*) FROM adjudication_history h
            WHERE h.student_id = s.id AND h.round = 2 AND h.result = 'correct'
          ) < 2
        `);
      } else if (prevRound === 3) {
        await client.query(`
          UPDATE students s
          SET is_alive = false
          WHERE is_alive = true AND (
            SELECT COUNT(*) FROM adjudication_history h
            WHERE h.student_id = s.id AND h.round = 3 AND h.result = 'correct'
          ) < 3
        `);
      }

      const anyActive = await client.query(`SELECT id FROM students WHERE is_alive = true ORDER BY id ASC LIMIT 1`);
      const nextSid = anyActive.rows[0]?.id || null;

      const minQ = nextRound === 1 ? 1 : (nextRound === 2 ? 101 : (nextRound === 3 ? 201 : (nextRound === 4 ? 301 : 401)));
      const maxQ = nextRound === 1 ? 100 : (nextRound === 2 ? 200 : (nextRound === 3 ? 300 : (nextRound === 4 ? 400 : 500)));

      const unusedWordRes = await client.query(`
        SELECT question_num FROM words
        WHERE is_used = false AND question_num BETWEEN $1 AND $2
        ORDER BY question_num ASC LIMIT 1
      `, [minQ, maxQ]);

      let nextQNum = unusedWordRes.rows[0]?.question_num;
      if (!nextQNum) {
        const anyUnused = await client.query(`SELECT question_num FROM words WHERE is_used = false ORDER BY question_num ASC LIMIT 1`);
        nextQNum = anyUnused.rows[0]?.question_num || null;
      }

      const nextFormat = nextRound >= 4 ? 'knockout' : 'qualification';

      await client.query(`
        UPDATE competition_state
        SET round = $1, round_format = $2, active_speller_id = $3, active_question_num = $4,
            current_spelling = '', adjudication_result = NULL, stage_word_revealed = false,
            decision_locked = false,
            timer_running = false, timer_end = 0, timer_paused_remaining = NULL
        WHERE id = 1
      `, [nextRound, nextFormat, nextSid, nextQNum]);
    }
    else if (action === 'SET_STAGE' || action === 'SWITCH_STAGE' || action === 'SET_ROUND') {
      const targetStage = Math.max(1, Math.min(4, parseInt(payload?.stage || payload?.round, 10) || 1));
      if (payload?.reviveAll || targetStage === 1) {
        await client.query('UPDATE students SET is_alive = true');
      }
      if (payload?.clearWords) {
        const minQ = targetStage === 1 ? 1 : (targetStage === 2 ? 101 : (targetStage === 3 ? 201 : 301));
        const maxQ = targetStage === 1 ? 100 : (targetStage === 2 ? 200 : (targetStage === 3 ? 300 : 400));
        await client.query('UPDATE words SET is_used = false WHERE question_num BETWEEN $1 AND $2', [minQ, maxQ]);
        await client.query('DELETE FROM adjudication_history WHERE round = $1', [targetStage]);
      }
      const anyActive = await client.query('SELECT id FROM students WHERE is_alive = true ORDER BY id ASC LIMIT 1');
      const nextSid = anyActive.rows[0]?.id || null;

      const minQ = targetStage === 1 ? 1 : (targetStage === 2 ? 101 : (targetStage === 3 ? 201 : 301));
      const maxQ = targetStage === 1 ? 100 : (targetStage === 2 ? 200 : (targetStage === 3 ? 300 : 400));

      const unusedWordRes = await client.query(`
        SELECT question_num FROM words
        WHERE is_used = false AND question_num BETWEEN $1 AND $2
        ORDER BY question_num ASC LIMIT 1
      `, [minQ, maxQ]);

      const nextQNum = unusedWordRes.rows[0]?.question_num || minQ;
      const nextFormat = targetStage >= 4 ? 'knockout' : 'qualification';

      await client.query(`
        UPDATE competition_state
        SET round = $1, round_format = $2, active_speller_id = $3, active_question_num = $4,
            current_spelling = '', adjudication_result = NULL, stage_word_revealed = false,
            decision_locked = false,
            timer_running = false, timer_end = 0, timer_paused_remaining = NULL
        WHERE id = 1
      `, [targetStage, nextFormat, nextSid, nextQNum]);
    }

    const updated = await broadcastState();
    res.json({ success: true, state: updated });
  } catch (err) {
    console.error('[API] Action error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── TIEBREAKER ENDPOINTS ──

// 1. Start a tiebreaker session
app.post('/api/tiebreaker/start', async (req, res) => {
  const { stage, tiedStudentIds, safeStudentIds, breakerLimit } = req.body;
  if (!Array.isArray(tiedStudentIds) || tiedStudentIds.length === 0) {
    return res.status(400).json({ error: 'No tied students provided for tiebreaker.' });
  }

  const client = await db.pool.connect();
  try {
    const curStage = parseInt(stage, 10) || 1;
    const minQ = curStage === 1 ? 1 : (curStage === 2 ? 101 : (curStage === 3 ? 201 : 301));
    const maxQ = curStage === 1 ? 100 : (curStage === 2 ? 200 : (curStage === 3 ? 300 : 400));

    // Remaining unused question from current stage
    const wordRes = await client.query(`
      SELECT question_num FROM words
      WHERE is_used = false AND question_num BETWEEN $1 AND $2
      ORDER BY question_num ASC LIMIT 1
    `, [minQ, maxQ]);

    const activeQ = wordRes.rows[0]?.question_num || minQ;
    const activeSid = tiedStudentIds[0];
    const bLimit = Math.max(1, parseInt(breakerLimit, 10) || 1);

    const tbData = {
      stage: curStage,
      breakerLimit: bLimit,
      safeStudentIds: Array.isArray(safeStudentIds) ? safeStudentIds : [],
      tiedStudentIds: tiedStudentIds,
      contestingStudentIds: [...tiedStudentIds],
      roundAttempts: {},
      passedStudentIds: [],
      eliminatedStudentIds: [],
      activeSpellerId: activeSid,
      activeQuestionNum: activeQ,
      currentSpelling: '',
      adjudicationResult: null,
      decisionLocked: false,
      timerRunning: false,
      timerEnd: 0,
      timerPausedRemaining: null,
      timerStartedForTurn: false,
      round: 1,
      targetMet: false,
      roundComplete: false,
      statusMessage: `Tiebreaker Round 1: ${tiedStudentIds.length} contestants competing for ${bLimit} advancement slot(s).`,
      history: []
    };

    await client.query(`
      UPDATE competition_state
      SET tiebreaker_active = true, tiebreaker_data = $1
      WHERE id = 1
    `, [JSON.stringify(tbData)]);

    const updated = await broadcastState();
    res.json({ success: true, tiebreakerData: tbData, state: updated });
  } catch (err) {
    console.error('[API] Tiebreaker start error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 2. Tiebreaker Actions
app.post('/api/tiebreaker/action', async (req, res) => {
  const { action, payload } = req.body;
  const client = await db.pool.connect();
  try {
    const stateRes = await client.query('SELECT * FROM competition_state WHERE id = 1');
    const state = stateRes.rows[0];
    if (!state.tiebreaker_active || !state.tiebreaker_data) {
      return res.status(400).json({ error: 'No active tiebreaker session.' });
    }

    const tb = typeof state.tiebreaker_data === 'string' ? JSON.parse(state.tiebreaker_data) : state.tiebreaker_data;
    const curStage = tb.stage || state.round;
    const minQ = curStage === 1 ? 1 : (curStage === 2 ? 101 : (curStage === 3 ? 201 : 301));
    const maxQ = curStage === 1 ? 100 : (curStage === 2 ? 200 : (curStage === 3 ? 300 : 400));

    if (action === 'START_TIMER') {
      let dur = tb.timerPausedRemaining !== null ? tb.timerPausedRemaining : (state.timer_duration || 60);
      dur = Math.max(5, Math.min(300, dur));
      tb.timerEnd = Date.now() + (dur * 1000);
      tb.timerRunning = true;
      tb.timerPausedRemaining = null;
      tb.timerStartedForTurn = true;
    }
    else if (action === 'PAUSE_TIMER') {
      if (tb.timerRunning) {
        tb.timerPausedRemaining = Math.max(0, Math.ceil((Number(tb.timerEnd) - Date.now()) / 1000));
        tb.timerRunning = false;
        tb.timerEnd = 0;
      }
    }
    else if (action === 'RESET_TIMER') {
      tb.timerRunning = false;
      tb.timerEnd = 0;
      tb.timerPausedRemaining = null;
      tb.timerStartedForTurn = false;
    }
    else if (action === 'UPDATE_SPELLING') {
      tb.currentSpelling = (payload?.spelling || '').toUpperCase();
    }
    else if (action === 'SELECT_SPELLER') {
      tb.activeSpellerId = parseInt(payload?.studentId, 10);
      tb.currentSpelling = '';
      tb.adjudicationResult = null;
      tb.decisionLocked = false;
      tb.timerStartedForTurn = false;
    }
    else if (action === 'SELECT_QUESTION') {
      tb.activeQuestionNum = parseInt(payload?.questionNum, 10);
      tb.currentSpelling = '';
      tb.adjudicationResult = null;
      tb.decisionLocked = false;
      tb.timerStartedForTurn = false;
    }
    else if (action === 'MARK_DECISION') {
      const isTimeout = payload?.isTimeout === true;

      if (tb.decisionLocked) {
        return res.status(400).json({ error: 'Decision already recorded for this turn. Advance to next speller.' });
      }

      const spelled = (tb.currentSpelling || '').trim();
      if (!isTimeout && spelled.length === 0) {
        return res.status(400).json({ error: 'Contestant must spell the word before recording.' });
      }

      const timerHasRun = tb.timerStartedForTurn || tb.timerRunning || Number(tb.timerEnd) > 0 || tb.timerPausedRemaining !== null;
      if (!timerHasRun) {
        return res.status(400).json({ error: 'Countdown timer must be started before recording a decision.' });
      }

      let isCorrect = payload?.isCorrect === true;
      const sid = tb.activeSpellerId;
      const qNum = tb.activeQuestionNum;

      const studentRes = await client.query('SELECT * FROM students WHERE id = $1', [sid]);
      const wordRes = await client.query('SELECT * FROM words WHERE question_num = $1', [qNum]);
      const student = studentRes.rows[0];
      const word = wordRes.rows[0];

      if (isTimeout) {
        const targetClean = (word?.word || '').toUpperCase().replace(/[^A-Z]/g, '');
        const spelledClean = spelled.toUpperCase().replace(/[^A-Z]/g, '');
        isCorrect = targetClean.length > 0 && targetClean === spelledClean;
      }

      if (student) {
        // Award exactly 1 mark for correct in tiebreaker
        const scores = student.scores || {};
        const oldStageScore = Number(scores[curStage]) || 0;
        const newStageScore = oldStageScore + (isCorrect ? 1 : 0);
        scores[curStage] = newStageScore;
        const totalPoints = Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0);

        await client.query(`
          UPDATE students
          SET scores = $1, total_points = $2
          WHERE id = $3
        `, [scores, totalPoints, sid]);

        // Insert adjudication history record
        await client.query(`
          INSERT INTO adjudication_history
          (round, student_id, student_name, question_num, word, spelled_letters, result, points_awarded)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          curStage,
          student.id,
          student.name,
          qNum,
          word ? word.word : spelled,
          spelled,
          isCorrect ? 'correct' : 'incorrect',
          isCorrect ? 1 : 0
        ]);

        if (qNum) {
          await client.query('UPDATE words SET is_used = true WHERE question_num = $1', [qNum]);
        }

        // Record attempt in current sub-round
        tb.roundAttempts = tb.roundAttempts || {};
        tb.roundAttempts[sid] = {
          result: isCorrect ? 'correct' : 'incorrect',
          pointsAwarded: isCorrect ? 1 : 0,
          questionNum: qNum,
          word: word ? word.word : spelled,
          spelled: spelled
        };

        tb.adjudicationResult = isCorrect ? 'correct' : 'incorrect';
        tb.decisionLocked = true;
        tb.timerRunning = false;
        tb.timerEnd = 0;
        tb.timerPausedRemaining = null;

        tb.history = tb.history || [];
        tb.history.push({
          round: tb.round || 1,
          spellerId: sid,
          spellerName: student.name,
          questionNum: qNum,
          word: word ? word.word : spelled,
          spelled,
          result: isCorrect ? 'correct' : 'incorrect',
          pointsAwarded: isCorrect ? 1 : 0,
          timestamp: new Date().toISOString()
        });
      }
    }
    else if (action === 'ADVANCE_SPELLER') {
      tb.contestingStudentIds = tb.contestingStudentIds || [];
      tb.roundAttempts = tb.roundAttempts || {};
      tb.passedStudentIds = tb.passedStudentIds || [];
      tb.eliminatedStudentIds = tb.eliminatedStudentIds || [];

      // Check if any student in current contesting list has NOT yet attempted in this sub-round
      const unattempted = tb.contestingStudentIds.filter(id => !tb.roundAttempts[id]);

      if (unattempted.length > 0) {
        // Move to the next student in this round rotation
        tb.activeSpellerId = unattempted[0];
        const stepNum = tb.contestingStudentIds.length - unattempted.length + 1;
        tb.statusMessage = `Tiebreaker Round ${tb.round}: Speller #${String(tb.activeSpellerId).padStart(3, '0')} on stage (${stepNum} of ${tb.contestingStudentIds.length})`;
      } else {
        // ALL contestants in this round have completed their question! Runoff Evaluation:
        const roundCorrect = tb.contestingStudentIds.filter(id => tb.roundAttempts[id]?.result === 'correct');
        const roundIncorrect = tb.contestingStudentIds.filter(id => tb.roundAttempts[id]?.result === 'incorrect');
        const slotsNeeded = tb.breakerLimit - tb.passedStudentIds.length;

        if (roundCorrect.length === slotsNeeded) {
          // Case 1: Exact match!
          tb.passedStudentIds = [...tb.passedStudentIds, ...roundCorrect];
          tb.eliminatedStudentIds = [...tb.eliminatedStudentIds, ...roundIncorrect];
          tb.contestingStudentIds = [];
          tb.targetMet = true;
          tb.roundComplete = true;
          tb.statusMessage = `🎉 Tiebreaker Complete! All ${tb.breakerLimit} required slot(s) filled. Click "Confirm Advancement" below.`;
        } else if (roundCorrect.length > slotsNeeded) {
          // Case 2: More passed than slots available! (e.g. needed 2, 3 passed)
          tb.eliminatedStudentIds = [...tb.eliminatedStudentIds, ...roundIncorrect];
          tb.contestingStudentIds = [...roundCorrect];
          tb.round = (tb.round || 1) + 1;
          tb.roundAttempts = {};
          tb.activeSpellerId = tb.contestingStudentIds[0];
          tb.targetMet = false;
          tb.roundComplete = false;
          tb.statusMessage = `⚖️ Round ${tb.round - 1} Result: ${roundCorrect.length} contestants passed (only ${slotsNeeded} slot(s) needed). Starting Tiebreaker Round ${tb.round} with these ${roundCorrect.length} contestants!`;
        } else if (roundCorrect.length < slotsNeeded && roundCorrect.length > 0) {
          // Case 3: Some passed, but fewer than needed! (e.g. needed 2, 1 passed, 6 failed)
          tb.passedStudentIds = [...tb.passedStudentIds, ...roundCorrect];
          const remainingSlots = slotsNeeded - roundCorrect.length;
          tb.contestingStudentIds = [...roundIncorrect];
          tb.round = (tb.round || 1) + 1;
          tb.roundAttempts = {};
          tb.activeSpellerId = tb.contestingStudentIds[0];
          tb.targetMet = false;
          tb.roundComplete = false;
          tb.statusMessage = `⚖️ Round ${tb.round - 1} Result: ${roundCorrect.length} contestant(s) qualified! ${remainingSlots} slot(s) remaining. Starting Tiebreaker Round ${tb.round} with the other ${roundIncorrect.length} contestants.`;
        } else {
          // Case 4: All missed in this round (roundCorrect.length === 0)
          tb.round = (tb.round || 1) + 1;
          tb.roundAttempts = {};
          tb.activeSpellerId = tb.contestingStudentIds[0];
          tb.targetMet = false;
          tb.roundComplete = false;
          tb.statusMessage = `⚖️ Round ${tb.round - 1} Result: All contestants missed. Repeating round with all ${tb.contestingStudentIds.length} contestants (Round ${tb.round}).`;
        }
      }

      // Next unused question from current stage
      const wordRes = await client.query(`
        SELECT question_num FROM words
        WHERE is_used = false AND question_num BETWEEN $1 AND $2
        ORDER BY question_num ASC LIMIT 1
      `, [minQ, maxQ]);

      tb.activeQuestionNum = wordRes.rows[0]?.question_num || minQ;
      tb.currentSpelling = '';
      tb.adjudicationResult = null;
      tb.decisionLocked = false;
      tb.timerStartedForTurn = false;
      tb.timerRunning = false;
      tb.timerEnd = 0;
      tb.timerPausedRemaining = null;
    }

    await client.query(`
      UPDATE competition_state
      SET tiebreaker_data = $1
      WHERE id = 1
    `, [JSON.stringify(tb)]);

    const updated = await broadcastState();
    res.json({ success: true, tiebreakerData: tb, state: updated });
  } catch (err) {
    console.error('[API] Tiebreaker action error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 3. Confirm Advancement from Tiebreaker
app.post('/api/tiebreaker/confirm', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const stateRes = await client.query('SELECT * FROM competition_state WHERE id = 1');
    const state = stateRes.rows[0];
    const tb = typeof state.tiebreaker_data === 'string' ? JSON.parse(state.tiebreaker_data) : state.tiebreaker_data;

    const currentStage = tb.stage || state.round;
    const nextStage = Math.min(4, currentStage + 1);
    const nextFormat = nextStage >= 4 ? 'knockout' : 'qualification';

    const safeStudents = (tb.safeStudentIds || req.body.safeStudentIds || []);
    const passedFromTie = (tb.passedStudentIds || []);
    const allAdvancingIds = [...new Set([...safeStudents, ...passedFromTie])];

    if (allAdvancingIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No advancing students identified.' });
    }

    // Eliminate dropped students
    await client.query(`
      UPDATE students
      SET is_alive = false
      WHERE is_alive = true AND NOT (id = ANY($1::int[]))
    `, [allAdvancingIds]);

    // Keep advancing students active
    await client.query(`
      UPDATE students
      SET is_alive = true
      WHERE id = ANY($1::int[])
    `, [allAdvancingIds]);

    const nextSid = allAdvancingIds[0];
    const minQ = nextStage === 1 ? 1 : (nextStage === 2 ? 101 : (nextStage === 3 ? 201 : (nextStage === 4 ? 301 : 401)));
    const maxQ = nextStage === 1 ? 100 : (nextStage === 2 ? 200 : (nextStage === 3 ? 300 : (nextStage === 4 ? 400 : 500)));

    const unusedWordRes = await client.query(`
      SELECT question_num FROM words
      WHERE is_used = false AND question_num BETWEEN $1 AND $2
      ORDER BY question_num ASC LIMIT 1
    `, [minQ, maxQ]);

    const nextQNum = unusedWordRes.rows[0]?.question_num || minQ;

    // Reset tiebreaker and advance stage
    await client.query(`
      UPDATE competition_state
      SET round = $1, round_format = $2, active_speller_id = $3, active_question_num = $4,
          current_spelling = '', adjudication_result = NULL, stage_word_revealed = false,
          decision_locked = false, timer_started_for_turn = false,
          timer_running = false, timer_end = 0, timer_paused_remaining = NULL,
          tiebreaker_active = false, tiebreaker_data = '{}'::jsonb
      WHERE id = 1
    `, [nextStage, nextFormat, nextSid, nextQNum]);

    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, message: `Advanced to Stage ${nextStage} with ${allAdvancingIds.length} qualified contestants.`, state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Tiebreaker confirm error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 4. Cancel Tiebreaker
app.post('/api/tiebreaker/cancel', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query(`
      UPDATE competition_state
      SET tiebreaker_active = false, tiebreaker_data = '{}'::jsonb
      WHERE id = 1
    `);
    const updated = await broadcastState();
    res.json({ success: true, message: 'Tiebreaker session cancelled.', state: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── REVERSE DECISION ──
app.post('/api/decision/reverse', async (req, res) => {
  const { historyId } = req.body;
  if (!historyId) {
    return res.status(400).json({ error: 'historyId is required' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const histRes = await client.query('SELECT * FROM adjudication_history WHERE id = $1', [historyId]);
    const hist = histRes.rows[0];
    if (!hist) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Adjudication record not found' });
    }

    const sid = hist.student_id;
    const stage = hist.round;
    const pts = Number(hist.points_awarded || 0);
    const wasCorrect = hist.result === 'correct';

    const stRes = await client.query('SELECT * FROM students WHERE id = $1', [sid]);
    const student = stRes.rows[0];
    if (student) {
      const scores = student.scores || {};
      scores[stage] = Math.max(0, (Number(scores[stage]) || 0) - pts);
      const totalPoints = Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0);
      const newCorrect = wasCorrect ? Math.max(0, (student.correct_count || 0) - 1) : student.correct_count;
      // Re-instate alive if was eliminated
      await client.query(`
        UPDATE students
        SET scores = $1, correct_count = $2, total_points = $3, is_alive = true
        WHERE id = $4
      `, [scores, newCorrect, totalPoints, sid]);
    }

    // Un-mark question as used so it can be re-attempted
    if (hist.question_num) {
      await client.query('UPDATE words SET is_used = false WHERE question_num = $1', [hist.question_num]);
    }

    // Delete the history record
    await client.query('DELETE FROM adjudication_history WHERE id = $1', [historyId]);

    // Unlock decision
    await client.query(`
      UPDATE competition_state
      SET adjudication_result = NULL, decision_locked = false
      WHERE id = 1
    `);

    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, message: 'Decision successfully reversed', state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Reverse decision error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── CALCULATE STAGE RANKINGS & ADVANCEMENT PREVIEW ──
app.post('/api/stage/end', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const stateRes = await client.query('SELECT * FROM competition_state WHERE id = 1');
    const state = stateRes.rows[0];
    const currentStage = state.round;
    const rule = db.STAGE_RULES[currentStage] || db.STAGE_RULES[4];
    const advanceTarget = rule.advanceCount;

    // Fetch alive students
    const studentsRes = await client.query('SELECT * FROM students WHERE is_alive = true ORDER BY id ASC');
    const students = studentsRes.rows;

    // Aggregate attempts and marks in current stage
    const histRes = await client.query(`
      SELECT 
        student_id,
        COUNT(*)::int as attempts,
        COUNT(*) FILTER (WHERE result = 'correct')::int as correct,
        COALESCE(SUM(points_awarded), 0)::int as stage_marks
      FROM adjudication_history
      WHERE round = $1
      GROUP BY student_id
    `, [currentStage]);

    const statsMap = {};
    histRes.rows.forEach(r => {
      statsMap[r.student_id] = {
        attempts: r.attempts,
        correct: r.correct,
        stageMarks: r.stage_marks
      };
    });

    const ranked = students.map(s => {
      const st = statsMap[s.id] || { attempts: 0, correct: 0, stageMarks: 0 };
      return {
        id: s.id,
        name: s.name,
        school: s.school,
        lga: s.lga,
        attempts: st.attempts,
        correct: st.correct,
        stageMarks: st.stageMarks
      };
    });

    // Sort: highest marks first, then highest correct count, then student id
    ranked.sort((a, b) => b.stageMarks - a.stageMarks || b.correct - a.correct || a.id - b.id);

    let tieAtCutoff = false;
    let tiedStudentIds = [];

    if (advanceTarget && ranked.length > advanceTarget) {
      const cutoffIndex = advanceTarget - 1;
      const cutoffScore = ranked[cutoffIndex].stageMarks;
      const firstDropped = ranked[advanceTarget];
      if (firstDropped.stageMarks === cutoffScore) {
        tieAtCutoff = true;
        tiedStudentIds = ranked.filter(s => s.stageMarks === cutoffScore).map(s => s.id);
      }
    }

    const resultRanked = ranked.map((s, idx) => {
      let result = 'advance';
      if (advanceTarget && idx >= advanceTarget) {
        result = 'dropped';
      }
      if (tieAtCutoff && tiedStudentIds.includes(s.id)) {
        result = 'tied';
      }
      return {
        ...s,
        position: idx + 1,
        result
      };
    });

    res.json({
      success: true,
      stage: currentStage,
      stageName: rule.name,
      advanceTarget,
      rankedStudents: resultRanked,
      tieAtCutoff,
      tiedStudentIds
    });
  } catch (err) {
    console.error('[API] Stage end error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── CONFIRM STAGE ADVANCEMENT ──
app.post('/api/stage/confirm-advance', async (req, res) => {
  const { advancingIds } = req.body;
  if (!Array.isArray(advancingIds) || advancingIds.length === 0) {
    return res.status(400).json({ error: 'No advancing student IDs specified' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const stateRes = await client.query('SELECT * FROM competition_state WHERE id = 1');
    const currentStage = stateRes.rows[0].round;
    const nextStage = Math.min(4, currentStage + 1);
    const nextFormat = nextStage >= 4 ? 'knockout' : 'qualification';

    // Mark non-advancing alive students as not alive (eliminated)
    await client.query(`
      UPDATE students
      SET is_alive = false
      WHERE is_alive = true AND NOT (id = ANY($1::int[]))
    `, [advancingIds]);

    // Ensure advancing students remain alive
    await client.query(`
      UPDATE students
      SET is_alive = true
      WHERE id = ANY($1::int[])
    `, [advancingIds]);

    // Choose first advancing student as active speller
    const nextSid = advancingIds[0];

    // Pick first unused question in the new stage
    const minQ = nextStage === 1 ? 1 : (nextStage === 2 ? 101 : (nextStage === 3 ? 201 : (nextStage === 4 ? 301 : 401)));
    const maxQ = nextStage === 1 ? 100 : (nextStage === 2 ? 200 : (nextStage === 3 ? 300 : (nextStage === 4 ? 400 : 500)));

    const unusedWordRes = await client.query(`
      SELECT question_num FROM words
      WHERE is_used = false AND question_num BETWEEN $1 AND $2
      ORDER BY question_num ASC LIMIT 1
    `, [minQ, maxQ]);

    let nextQNum = unusedWordRes.rows[0]?.question_num;
    if (!nextQNum) {
      const anyUnused = await client.query(`SELECT question_num FROM words WHERE is_used = false ORDER BY question_num ASC LIMIT 1`);
      nextQNum = anyUnused.rows[0]?.question_num || null;
    }

    await client.query(`
      UPDATE competition_state
      SET round = $1, round_format = $2, active_speller_id = $3, active_question_num = $4,
          current_spelling = '', adjudication_result = NULL, stage_word_revealed = false,
          decision_locked = false,
          timer_running = false, timer_end = 0, timer_paused_remaining = NULL
      WHERE id = 1
    `, [nextStage, nextFormat, nextSid, nextQNum]);

    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, message: `Successfully advanced to Stage ${nextStage}`, state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Confirm advance error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── MANUAL STAGE SWITCH / GO BACK / JUMP ──
app.post('/api/stage/switch', async (req, res) => {
  const { stage, clearWords, reviveAll } = req.body;
  const targetStage = Math.max(1, Math.min(4, parseInt(stage, 10) || 1));
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (reviveAll || targetStage === 1) {
      await client.query('UPDATE students SET is_alive = true');
    }
    if (clearWords) {
      const minQ = targetStage === 1 ? 1 : (targetStage === 2 ? 101 : (targetStage === 3 ? 201 : 301));
      const maxQ = targetStage === 1 ? 100 : (targetStage === 2 ? 200 : (targetStage === 3 ? 300 : 400));
      await client.query('UPDATE words SET is_used = false WHERE question_num BETWEEN $1 AND $2', [minQ, maxQ]);
      await client.query('DELETE FROM adjudication_history WHERE round = $1', [targetStage]);
    }
    const anyActive = await client.query('SELECT id FROM students WHERE is_alive = true ORDER BY id ASC LIMIT 1');
    const nextSid = anyActive.rows[0]?.id || null;

    const minQ = targetStage === 1 ? 1 : (targetStage === 2 ? 101 : (targetStage === 3 ? 201 : 301));
    const maxQ = targetStage === 1 ? 100 : (targetStage === 2 ? 200 : (targetStage === 3 ? 300 : 400));

    const unusedWordRes = await client.query(`
      SELECT question_num FROM words
      WHERE is_used = false AND question_num BETWEEN $1 AND $2
      ORDER BY question_num ASC LIMIT 1
    `, [minQ, maxQ]);

    const nextQNum = unusedWordRes.rows[0]?.question_num || minQ;
    const nextFormat = targetStage >= 4 ? 'knockout' : 'qualification';

    await client.query(`
      UPDATE competition_state
      SET round = $1, round_format = $2, active_speller_id = $3, active_question_num = $4,
          current_spelling = '', adjudication_result = NULL, stage_word_revealed = false,
          decision_locked = false,
          timer_running = false, timer_end = 0, timer_paused_remaining = NULL
      WHERE id = 1
    `, [targetStage, nextFormat, nextSid, nextQNum]);

    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, message: `Switched to Stage ${targetStage}`, state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Stage switch error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Bulk import words
app.post('/api/words/bulk', async (req, res) => {
  const { words } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'No words provided' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const w of words) {
      await client.query(`
        INSERT INTO words (question_num, word, phonetic, pos, origin, definition, sentence, is_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false)
        ON CONFLICT (question_num) DO UPDATE
        SET word = EXCLUDED.word, phonetic = EXCLUDED.phonetic, pos = EXCLUDED.pos,
            origin = EXCLUDED.origin, definition = EXCLUDED.definition, sentence = EXCLUDED.sentence
      `, [w.num, w.word, w.phonetic || '', w.pos || 'Word', w.origin || 'Origin', w.def || '', w.sentence || '']);
    }
    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, count: words.length, state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Bulk import students
app.post('/api/students/bulk', async (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No spellers provided' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of students) {
      await client.query(`
        INSERT INTO students (id, name, school, lga, category, is_alive, scores, correct_count, total_points)
        VALUES ($1, $2, $3, $4, $5, true, '{}'::jsonb, 0, 0)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, school = EXCLUDED.school, lga = EXCLUDED.lga, category = EXCLUDED.category
      `, [s.id, s.name, s.school, s.lga || 'Dutse', s.category || 'Senior']);
    }
    await client.query('COMMIT');
    const updated = await broadcastState();
    res.json({ success: true, count: students.length, state: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Toggle student status (reinstate or eliminate)
app.post('/api/students/:id/toggle-status', async (req, res) => {
  const sid = parseInt(req.params.id);
  const client = await db.pool.connect();
  try {
    await client.query(`
      UPDATE students
      SET is_alive = NOT is_alive
      WHERE id = $1
    `, [sid]);
    const updated = await broadcastState();
    res.json({ success: true, state: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Update settings
app.post('/api/settings', async (req, res) => {
  const { title, subtitle, timerDuration, timerWarning, pointsPerWord, roundFormat, stageRevealMode, stageWordLimit, stageConfig } = req.body;
  let cleanDuration = Number(timerDuration);
  if (cleanDuration > 300) cleanDuration = (cleanDuration >= 1000) ? Math.round(cleanDuration / 1000) : 60;
  if (!cleanDuration || isNaN(cleanDuration)) cleanDuration = 60;

  const client = await db.pool.connect();
  try {
    await client.query(`
      UPDATE competition_state
      SET title = COALESCE($1, title),
          subtitle = COALESCE($2, subtitle),
          timer_duration = $3,
          timer_warning = COALESCE($4, timer_warning),
          points_per_word = COALESCE($5, points_per_word),
          round_format = COALESCE($6, round_format),
          stage_reveal_mode = COALESCE($7, stage_reveal_mode),
          stage_word_limit = COALESCE($8, stage_word_limit),
          stage_config = COALESCE($9, stage_config)
      WHERE id = 1
    `, [title, subtitle, cleanDuration, timerWarning, pointsPerWord, roundFormat, stageRevealMode, stageWordLimit, stageConfig ? JSON.stringify(stageConfig) : null]);
    const updated = await broadcastState();
    res.json({ success: true, state: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Socket.io Real-time connection handler
io.on('connection', async (socket) => {
  try {
    const fullState = await db.getFullState();
    socket.emit('STATE_UPDATE', fullState);
  } catch (err) {
    console.error('[SOCKET] Init error:', err.message);
  }
});

// Get local network IPv4 address for multi-device connections
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start Server
async function startServer() {
  try {
    await db.initDatabase();
    server.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      console.log('================================================================');
      console.log('  JIGAWA STATE SPELLING BEE CHAMPIONSHIP WEB SYSTEM ACTIVE');
      console.log('  Sponsored: Jigawa State Ministry of Education');
      console.log('  Organized: J-YEDA (Youth Educational Empowerment Association)');
      console.log('  Engineered & Built by: KowaguruTech');
      console.log('================================================================');
      console.log(`  Local Access:      http://localhost:${PORT}`);
      console.log(`  Auditorium Wi-Fi:  http://${localIp}:${PORT}`);
      console.log('----------------------------------------------------------------');
      console.log(`  👨‍⚖️ Judges & Pronouncer Cockpit:  http://${localIp}:${PORT}/judge`);
      console.log(`  🖥️ Stage & Projector Screen:    http://${localIp}:${PORT}/projector`);
      console.log(`  🧑‍🎓 Speller Downstage Monitor:   http://${localIp}:${PORT}/speller`);
      console.log(`  📊 Ministerial Leaderboard:      http://${localIp}:${PORT}/leaderboard`);
      console.log('================================================================');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

startServer();

module.exports = app;
