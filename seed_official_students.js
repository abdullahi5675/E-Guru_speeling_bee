const { pool } = require('./db');
require('dotenv').config();

const officialStudents = [
  // MBPS GUMEL (Gumel LGA)
  { id: 1, name: "Humaira Sani", school: "MBPS Gumel", lga: "Gumel", category: "JSS" },
  { id: 2, name: "Khadija Lawan", school: "MBPS Gumel", lga: "Gumel", category: "JSS" },
  { id: 3, name: "Adama Ya'u", school: "MBPS Gumel", lga: "Gumel", category: "JSS" },

  // MBPS BULANGU (Bulangu / Kafin Hausa)
  { id: 4, name: "Musa Yakubu", school: "MBPS Bulangu", lga: "Bulangu", category: "JSS" },
  { id: 5, name: "Ibrahim Yakubu", school: "MBPS Bulangu", lga: "Bulangu", category: "JSS" },
  { id: 6, name: "Abdurrahid Muhammad", school: "MBPS Bulangu", lga: "Bulangu", category: "JSS" },

  // MBPS KUDAI DUTSE (Dutse LGA)
  { id: 7, name: "Fatima Munkaila Alhassan", school: "MBPS Kudai Dutse", lga: "Dutse", category: "JSS" },
  { id: 8, name: "Ummusalma Baffa", school: "MBPS Kudai Dutse", lga: "Dutse", category: "JSS" },
  { id: 9, name: "Maimuna Muaazu", school: "MBPS Kudai Dutse", lga: "Dutse", category: "JSS" },

  // NOMADIC DUTSE (Dutse LGA)
  { id: 10, name: "Ummusalma Ya'u", school: "Nomadic Dutse", lga: "Dutse", category: "JSS" },
  { id: 11, name: "Zuwairiyya Sulaiman Haruna", school: "Nomadic Dutse", lga: "Dutse", category: "JSS" },
  { id: 12, name: "[Contestant 3 - Pending]", school: "Nomadic Dutse", lga: "Dutse", category: "JSS" },

  // MEGA SCHOOL DUTSE (Dutse LGA)
  { id: 13, name: "Ahmad Usman", school: "Mega School Dutse", lga: "Dutse", category: "JSS" },
  { id: 14, name: "Zainab Yahaya", school: "Mega School Dutse", lga: "Dutse", category: "JSS" },
  { id: 15, name: "Sakina Abdulaziz", school: "Mega School Dutse", lga: "Dutse", category: "JSS" },

  // JSS DANGAN TSAURE (Pending Students)
  { id: 16, name: "[Contestant 1 - Pending]", school: "JSS Dangan Tsaure", lga: "Dutse", category: "JSS" },
  { id: 17, name: "[Contestant 2 - Pending]", school: "JSS Dangan Tsaure", lga: "Dutse", category: "JSS" },
  { id: 18, name: "[Contestant 3 - Pending]", school: "JSS Dangan Tsaure", lga: "Dutse", category: "JSS" },
];

async function seedStudents() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear previous demo students and history
    await client.query('TRUNCATE TABLE adjudication_history RESTART IDENTITY');
    await client.query('TRUNCATE TABLE students RESTART IDENTITY');

    for (const s of officialStudents) {
      await client.query(
        `INSERT INTO students (id, name, school, lga, category, is_alive, scores, correct_count, total_points)
         VALUES ($1, $2, $3, $4, $5, true, '{}', 0, 0)`,
        [s.id, s.name, s.school, s.lga, s.category]
      );
    }

    // Reset competition state to Round 1, active speller 1, active question 1
    await client.query(`
      UPDATE competition_state
      SET round = 1,
          round_format = 'qualification',
          active_speller_id = 1,
          active_question_num = 1,
          current_spelling = '',
          adjudication_result = NULL,
          stage_word_revealed = false,
          timer_running = false,
          timer_end = 0,
          timer_paused_remaining = NULL
      WHERE id = 1
    `);

    // Reset words is_used flags
    await client.query('UPDATE words SET is_used = false');

    await client.query('COMMIT');
    console.log(`Successfully seeded ${officialStudents.length} official contestants across 6 schools into PostgreSQL!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedStudents();
