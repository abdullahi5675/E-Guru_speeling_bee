const db = require('./db');

(async () => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM adjudication_history');
    await client.query('UPDATE words SET is_used = false');
    await client.query("UPDATE students SET correct_count=0, total_points=0, scores='{}'::jsonb, is_alive=true");
    await client.query(`
      UPDATE competition_state 
      SET round=1, round_format='qualification', active_speller_id=1, active_question_num=1,
          current_spelling='', adjudication_result=NULL, stage_word_revealed=false,
          decision_locked=false, stage_word_limit=4, points_per_word=25,
          timer_duration=60, timer_warning=10,
          timer_running=false, timer_end=0, timer_paused_remaining=NULL,
          timer_started_for_turn=false, tiebreaker_active=false, tiebreaker_data='{}'::jsonb
      WHERE id=1
    `);
    await client.query('COMMIT');
    console.log('CLEAN_START_OK: Database reset successfully to Stage 1, Speller #1, Timer 60s.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR:', e.message);
  } finally {
    client.release();
    await db.pool.end();
  }
})();
