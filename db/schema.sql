-- Jigawa State Spelling Bee Championship Database Schema
-- Database: jigawa_spelling_bee

CREATE TABLE IF NOT EXISTS competition_state (
    id INT PRIMARY KEY DEFAULT 1,
    title VARCHAR(255) NOT NULL DEFAULT 'Jigawa State Inter-School Spelling Bee Championship',
    subtitle VARCHAR(255) NOT NULL DEFAULT 'Sponsored by Jigawa State Ministry of Education • Organized by J-YEDA • Engineered by KowaguruTech',
    round INT NOT NULL DEFAULT 1,
    round_format VARCHAR(50) NOT NULL DEFAULT 'qualification',
    timer_duration INT NOT NULL DEFAULT 60,
    timer_warning INT NOT NULL DEFAULT 10,
    points_per_word INT NOT NULL DEFAULT 25,
    stage_reveal_mode VARCHAR(50) NOT NULL DEFAULT 'hidden',
    stage_word_revealed BOOLEAN NOT NULL DEFAULT false,
    active_speller_id INT DEFAULT NULL,
    active_question_num INT DEFAULT NULL,
    current_spelling TEXT NOT NULL DEFAULT '',
    adjudication_result VARCHAR(50) DEFAULT NULL,
    decision_locked BOOLEAN NOT NULL DEFAULT false,
    stage_word_limit INT NOT NULL DEFAULT 4,
    timer_end BIGINT NOT NULL DEFAULT 0,
    timer_running BOOLEAN NOT NULL DEFAULT false,
    timer_paused_remaining INT DEFAULT NULL,
    timer_started_for_turn BOOLEAN NOT NULL DEFAULT false,
    tiebreaker_active BOOLEAN NOT NULL DEFAULT false,
    tiebreaker_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    stage_config JSONB NOT NULL DEFAULT '{
      "numStages": 4,
      "wordsPerStage": 4,
      "pointsMain": 25,
      "pointsTie": 1,
      "stages": {
        "1": { "name": "Preliminary / Knockout", "students": 18, "advance": 10 },
        "2": { "name": "Quarter-Final", "students": 10, "advance": 5 },
        "3": { "name": "Semi-Final", "students": 5, "advance": 3 },
        "4": { "name": "Grand Final", "students": 3, "advance": 1 }
      }
    }'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure newly added columns exist in existing deployments
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS decision_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS stage_word_limit INT NOT NULL DEFAULT 4;
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS timer_started_for_turn BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS tiebreaker_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS tiebreaker_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS stage_config JSONB NOT NULL DEFAULT '{
  "numStages": 4,
  "wordsPerStage": 4,
  "pointsMain": 25,
  "pointsTie": 1,
  "stages": {
    "1": { "name": "Preliminary / Knockout", "students": 18, "advance": 10 },
    "2": { "name": "Quarter-Final", "students": 10, "advance": 5 },
    "3": { "name": "Semi-Final", "students": 5, "advance": 3 },
    "4": { "name": "Grand Final", "students": 3, "advance": 1 }
  }
}'::jsonb;

-- Sanitize timer_duration if it was mistakenly set to milliseconds (e.g. 5000)
UPDATE competition_state SET timer_duration = 60 WHERE timer_duration > 300;
UPDATE competition_state SET timer_paused_remaining = NULL WHERE timer_paused_remaining > 300;

CREATE TABLE IF NOT EXISTS words (
    question_num INT PRIMARY KEY,
    word VARCHAR(255) NOT NULL,
    phonetic VARCHAR(255),
    pos VARCHAR(100) DEFAULT 'Word',
    origin VARCHAR(255) DEFAULT 'Origin',
    definition TEXT,
    sentence TEXT,
    is_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    school VARCHAR(255) NOT NULL,
    lga VARCHAR(100) NOT NULL DEFAULT 'Dutse',
    category VARCHAR(100) NOT NULL DEFAULT 'Senior',
    is_alive BOOLEAN NOT NULL DEFAULT true,
    scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    correct_count INT NOT NULL DEFAULT 0,
    total_points INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adjudication_history (
    id SERIAL PRIMARY KEY,
    round INT NOT NULL,
    student_id INT,
    student_name VARCHAR(255),
    question_num INT,
    word VARCHAR(255),
    spelled_letters TEXT,
    result VARCHAR(50) NOT NULL,
    points_awarded INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial default state record if not exists
INSERT INTO competition_state (id, title, subtitle, round, round_format, timer_duration, timer_warning, points_per_word, stage_word_limit, decision_locked)
VALUES (1, 'Jigawa State Inter-School Spelling Bee Championship', 'Sponsored by Jigawa State Ministry of Education • Organized by J-YEDA • Engineered by KowaguruTech', 1, 'qualification', 60, 10, 25, 4, false)
ON CONFLICT (id) DO NOTHING;
