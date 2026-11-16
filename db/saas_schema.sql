-- ================================================================
-- E-GURU SPELLING BEE — SaaS Multi-Tenant Schema Extension
-- Run once on existing database to add multi-org support
-- ================================================================

-- 1. Organizations table (each school / board that signs up)
CREATE TABLE IF NOT EXISTS organizations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    logo_url    TEXT DEFAULT NULL,
    contact_name VARCHAR(255) DEFAULT NULL,
    contact_phone VARCHAR(50) DEFAULT NULL,
    location    VARCHAR(255) DEFAULT NULL,
    plan        VARCHAR(50) NOT NULL DEFAULT 'free',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add org_id to competition_state (NULL = legacy Jigawa org, org_id = orgs that registered)
ALTER TABLE competition_state ADD COLUMN IF NOT EXISTS org_id INT DEFAULT NULL REFERENCES organizations(id) ON DELETE CASCADE;

-- 3. Each org gets their own independent competition_state row (not id=1)
--    We use a separate table so each org has one live state
CREATE TABLE IF NOT EXISTS org_competition_state (
    id          SERIAL PRIMARY KEY,
    org_id      INT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL DEFAULT 'Spelling Bee Championship',
    subtitle    VARCHAR(255) NOT NULL DEFAULT 'Powered by E-Guru Platform',
    round       INT NOT NULL DEFAULT 1,
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
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Per-org students
CREATE TABLE IF NOT EXISTS org_students (
    id          SERIAL PRIMARY KEY,
    org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contestant_num INT NOT NULL,
    name        VARCHAR(255) NOT NULL,
    school      VARCHAR(255) NOT NULL,
    zone        VARCHAR(100) NOT NULL DEFAULT '',
    category    VARCHAR(100) NOT NULL DEFAULT 'Junior',
    is_alive    BOOLEAN NOT NULL DEFAULT true,
    scores      JSONB NOT NULL DEFAULT '{}'::jsonb,
    correct_count INT NOT NULL DEFAULT 0,
    total_points INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, contestant_num)
);

-- 5. Per-org words
CREATE TABLE IF NOT EXISTS org_words (
    id          SERIAL PRIMARY KEY,
    org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    question_num INT NOT NULL,
    word        VARCHAR(255) NOT NULL,
    phonetic    VARCHAR(255),
    pos         VARCHAR(100) DEFAULT 'Word',
    origin      VARCHAR(255) DEFAULT 'Origin',
    definition  TEXT,
    sentence    TEXT,
    is_used     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, question_num)
);

-- 6. Per-org adjudication history
CREATE TABLE IF NOT EXISTS org_adjudication_history (
    id          SERIAL PRIMARY KEY,
    org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    round       INT NOT NULL,
    student_id  INT,
    student_name VARCHAR(255),
    question_num INT,
    word        VARCHAR(255),
    spelled_letters TEXT,
    result      VARCHAR(50) NOT NULL,
    points_awarded INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Auth sessions / tokens (simple server-side session table)
CREATE TABLE IF NOT EXISTS org_sessions (
    id          SERIAL PRIMARY KEY,
    org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
