-- ============================================================
-- COACH-LIFE — Migration initiale complète
-- Fastify + pg | Multi-user strict | RLS | IA-ready
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Auth Sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Password Resets
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Days
CREATE TABLE IF NOT EXISTS days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('CREATED','STARTED','COMPLETED')),
  completion_rate INT DEFAULT 0,
  discipline_streak INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 6. Concepts
CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized TEXT NOT NULL,
  usage_count INT DEFAULT 0,
  embedding TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(type, normalized)
);

-- 7. Concept Aliases
CREATE TABLE IF NOT EXISTS concept_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  normalized TEXT UNIQUE NOT NULL
);

-- 8. Day Entries
CREATE TABLE IF NOT EXISTS day_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Analysis Events
CREATE TABLE IF NOT EXISTS analysis_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  embedding TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_days_user_date ON days(user_id, date);
CREATE INDEX IF NOT EXISTS idx_concepts_norm ON concepts(normalized);
CREATE INDEX IF NOT EXISTS idx_entries_day ON day_entries(day_id);
CREATE INDEX IF NOT EXISTS idx_analysis_user ON analysis_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================
ALTER TABLE days ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_events ENABLE ROW LEVEL SECURITY;
-- RLS non appliqué sur auth_sessions et password_resets
-- car le refresh/reset flow nécessite de lire les tokens avant de connaître le user_id

-- Policies: days
CREATE POLICY days_user_isolation ON days
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- Policies: day_entries
CREATE POLICY day_entries_user_isolation ON day_entries
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- Policies: analysis_events
CREATE POLICY analysis_events_user_isolation ON analysis_events
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- Policies: auth_sessions
CREATE POLICY auth_sessions_user_isolation ON auth_sessions
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- Policies: password_resets
CREATE POLICY password_resets_user_isolation ON password_resets
  USING (user_id = current_setting('app.user_id', true)::UUID);

-- ============================================================
-- FONCTIONS MÉTIER
-- ============================================================

-- Crée une journée pour un utilisateur
CREATE OR REPLACE FUNCTION create_day(p_user_id UUID, p_date DATE)
RETURNS UUID AS $$
DECLARE
  v_day_id UUID;
BEGIN
  INSERT INTO days (user_id, date, status)
  VALUES (p_user_id, p_date, 'CREATED')
  ON CONFLICT (user_id, date) DO NOTHING
  RETURNING id INTO v_day_id;

  IF v_day_id IS NULL THEN
    SELECT id INTO v_day_id FROM days WHERE user_id = p_user_id AND date = p_date;
  END IF;

  RETURN v_day_id;
END;
$$ LANGUAGE plpgsql;

-- Normalise une chaîne (minuscule, sans accents, trim)
CREATE OR REPLACE FUNCTION normalize_text(input TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(trim(regexp_replace(input, '\s+', ' ', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Match ou crée un concept
CREATE OR REPLACE FUNCTION match_or_create_concept(p_type TEXT, p_text TEXT)
RETURNS UUID AS $$
DECLARE
  v_norm TEXT;
  v_id UUID;
BEGIN
  v_norm := normalize_text(p_text);

  SELECT id INTO v_id FROM concepts WHERE type = p_type AND normalized = v_norm;
  IF FOUND THEN
    UPDATE concepts SET usage_count = usage_count + 1 WHERE id = v_id;
    RETURN v_id;
  END IF;

  SELECT concept_id INTO v_id FROM concept_aliases WHERE normalized = v_norm;
  IF FOUND THEN
    UPDATE concepts SET usage_count = usage_count + 1 WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO concepts (type, label, normalized)
  VALUES (p_type, trim(p_text), v_norm)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Suggère des concepts existants (LIKE query)
CREATE OR REPLACE FUNCTION suggest_concepts(p_type TEXT, p_query TEXT)
RETURNS TABLE(id UUID, label TEXT, usage_count INT) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.label, c.usage_count
  FROM concepts c
  WHERE c.type = p_type AND c.normalized LIKE '%' || normalize_text(p_query) || '%'
  ORDER BY c.usage_count DESC, c.label ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Configure le matin (actions + focus)
CREATE OR REPLACE FUNCTION set_morning(
  p_user_id UUID,
  p_day_id UUID,
  p_actions TEXT[],
  p_focus TEXT
)
RETURNS VOID AS $$
DECLARE
  v_action TEXT;
  v_concept_id UUID;
BEGIN
  -- Vérifier que le jour appartient à l'utilisateur
  PERFORM 1 FROM days WHERE id = p_day_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day not found or access denied';
  END IF;

  -- Nettoyer les anciennes entrées du matin pour ce jour
  DELETE FROM day_entries WHERE day_id = p_day_id AND user_id = p_user_id AND type = 'ACTION';
  DELETE FROM day_entries WHERE day_id = p_day_id AND user_id = p_user_id AND type = 'FOCUS';

  -- Insérer les actions
  FOREACH v_action IN ARRAY p_actions LOOP
    v_concept_id := match_or_create_concept('ACTION', v_action);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text, status)
    VALUES (p_day_id, p_user_id, 'ACTION', v_concept_id, trim(v_action), 'PENDING');
  END LOOP;

  -- Insérer le focus
  v_concept_id := match_or_create_concept('FOCUS', p_focus);
  INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text, status)
  VALUES (p_day_id, p_user_id, 'FOCUS', v_concept_id, trim(p_focus), NULL);

  -- Mettre à jour le statut
  UPDATE days SET status = 'STARTED' WHERE id = p_day_id;
END;
$$ LANGUAGE plpgsql;

-- Met à jour l'exécution (status des actions)
CREATE OR REPLACE FUNCTION update_execution(
  p_user_id UUID,
  p_day_id UUID,
  p_updates JSONB
)
RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_entry_id UUID;
  v_status TEXT;
BEGIN
  PERFORM 1 FROM days WHERE id = p_day_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day not found or access denied';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    v_entry_id := (v_item->>'id')::UUID;
    v_status := v_item->>'status';

    UPDATE day_entries
    SET status = v_status
    WHERE id = v_entry_id AND day_id = p_day_id AND user_id = p_user_id AND type = 'ACTION';
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Configure le soir (analyse)
CREATE OR REPLACE FUNCTION set_evening(
  p_user_id UUID,
  p_day_id UUID,
  p_accomplishments TEXT,
  p_avoidances TEXT,
  p_failure_reason TEXT,
  p_lessons TEXT,
  p_rule_for_tomorrow TEXT
)
RETURNS VOID AS $$
DECLARE
  v_concept_id UUID;
BEGIN
  PERFORM 1 FROM days WHERE id = p_day_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day not found or access denied';
  END IF;

  -- Nettoyer anciennes entrées evening
  DELETE FROM day_entries WHERE day_id = p_day_id AND user_id = p_user_id AND type IN ('ACCOMPLISHMENT','AVOIDANCE','FAILURE_REASON','LESSON','RULE');
  DELETE FROM analysis_events WHERE day_id = p_day_id AND user_id = p_user_id AND type IN ('ACCOMPLISHMENT','AVOIDANCE','FAILURE_REASON','LESSON','RULE');

  -- accomplishments
  IF p_accomplishments IS NOT NULL AND length(trim(p_accomplishments)) > 0 THEN
    v_concept_id := match_or_create_concept('ACCOMPLISHMENT', p_accomplishments);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text)
    VALUES (p_day_id, p_user_id, 'ACCOMPLISHMENT', v_concept_id, trim(p_accomplishments));
    INSERT INTO analysis_events (user_id, day_id, type, content, concept_id)
    VALUES (p_user_id, p_day_id, 'ACCOMPLISHMENT', trim(p_accomplishments), v_concept_id);
  END IF;

  -- avoidances
  IF p_avoidances IS NOT NULL AND length(trim(p_avoidances)) > 0 THEN
    v_concept_id := match_or_create_concept('AVOIDANCE', p_avoidances);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text)
    VALUES (p_day_id, p_user_id, 'AVOIDANCE', v_concept_id, trim(p_avoidances));
    INSERT INTO analysis_events (user_id, day_id, type, content, concept_id)
    VALUES (p_user_id, p_day_id, 'AVOIDANCE', trim(p_avoidances), v_concept_id);
  END IF;

  -- failure_reason
  IF p_failure_reason IS NOT NULL AND length(trim(p_failure_reason)) > 0 THEN
    v_concept_id := match_or_create_concept('FAILURE_REASON', p_failure_reason);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text)
    VALUES (p_day_id, p_user_id, 'FAILURE_REASON', v_concept_id, trim(p_failure_reason));
    INSERT INTO analysis_events (user_id, day_id, type, content, concept_id)
    VALUES (p_user_id, p_day_id, 'FAILURE_REASON', trim(p_failure_reason), v_concept_id);
  END IF;

  -- lessons
  IF p_lessons IS NOT NULL AND length(trim(p_lessons)) > 0 THEN
    v_concept_id := match_or_create_concept('LESSON', p_lessons);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text)
    VALUES (p_day_id, p_user_id, 'LESSON', v_concept_id, trim(p_lessons));
    INSERT INTO analysis_events (user_id, day_id, type, content, concept_id)
    VALUES (p_user_id, p_day_id, 'LESSON', trim(p_lessons), v_concept_id);
  END IF;

  -- rule_for_tomorrow
  IF p_rule_for_tomorrow IS NOT NULL AND length(trim(p_rule_for_tomorrow)) > 0 THEN
    v_concept_id := match_or_create_concept('RULE', p_rule_for_tomorrow);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text)
    VALUES (p_day_id, p_user_id, 'RULE', v_concept_id, trim(p_rule_for_tomorrow));
    INSERT INTO analysis_events (user_id, day_id, type, content, concept_id)
    VALUES (p_user_id, p_day_id, 'RULE', trim(p_rule_for_tomorrow), v_concept_id);
  END IF;

  -- Calcul completion_rate
  UPDATE days
  SET status = 'COMPLETED',
      completion_rate = (
        SELECT COALESCE(
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'DONE') / NULLIF(COUNT(*), 0)
          ), 0)
        FROM day_entries
        WHERE day_id = p_day_id AND type = 'ACTION'
      )
  WHERE id = p_day_id;
END;
$$ LANGUAGE plpgsql;

-- Gratitude
CREATE OR REPLACE FUNCTION set_gratitude(
  p_user_id UUID,
  p_day_id UUID,
  p_items TEXT[]
)
RETURNS VOID AS $$
DECLARE
  v_item TEXT;
  v_concept_id UUID;
BEGIN
  PERFORM 1 FROM days WHERE id = p_day_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day not found or access denied';
  END IF;

  DELETE FROM day_entries WHERE day_id = p_day_id AND user_id = p_user_id AND type = 'GRATITUDE';

  FOREACH v_item IN ARRAY p_items LOOP
    v_concept_id := match_or_create_concept('GRATITUDE', v_item);
    INSERT INTO day_entries (day_id, user_id, type, concept_id, raw_text)
    VALUES (p_day_id, p_user_id, 'GRATITUDE', v_concept_id, trim(v_item));
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Score d'une journée
CREATE OR REPLACE FUNCTION get_day_score(p_user_id UUID, p_day_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_total INT;
  v_done INT;
  v_rate INT;
  v_has_evening BOOLEAN;
  v_has_gratitude BOOLEAN;
  v_score INT;
BEGIN
  PERFORM 1 FROM days WHERE id = p_day_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day not found or access denied';
  END IF;

  SELECT COUNT(*) INTO v_total FROM day_entries WHERE day_id = p_day_id AND type = 'ACTION';
  SELECT COUNT(*) INTO v_done FROM day_entries WHERE day_id = p_day_id AND type = 'ACTION' AND status = 'DONE';
  v_rate := CASE WHEN v_total > 0 THEN ROUND(100.0 * v_done / v_total) ELSE 0 END;

  SELECT EXISTS(SELECT 1 FROM day_entries WHERE day_id = p_day_id AND type IN ('ACCOMPLISHMENT','LESSON')) INTO v_has_evening;
  SELECT EXISTS(SELECT 1 FROM day_entries WHERE day_id = p_day_id AND type = 'GRATITUDE') INTO v_has_gratitude;

  v_score := v_rate;
  IF v_has_evening THEN v_score := v_score + 20; END IF;
  IF v_has_gratitude THEN v_score := v_score + 10; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;

  RETURN jsonb_build_object(
    'day_id', p_day_id,
    'completion_rate', v_rate,
    'actions_total', v_total,
    'actions_done', v_done,
    'has_evening', v_has_evening,
    'has_gratitude', v_has_gratitude,
    'score', v_score
  );
END;
$$ LANGUAGE plpgsql;

-- Patterns utilisateur (tendances sur 30 derniers jours)
CREATE OR REPLACE FUNCTION get_user_patterns(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'avg_completion', COALESCE(ROUND(AVG(completion_rate)), 0),
    'days_count', COUNT(*),
    'top_concepts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', t.label, 'count', t.cnt)), '[]'::jsonb)
      FROM (
        SELECT co.label, COUNT(*) as cnt
        FROM day_entries de
        JOIN concepts co ON de.concept_id = co.id
        JOIN days d ON de.day_id = d.id
        WHERE d.user_id = p_user_id AND d.date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY co.label
        ORDER BY cnt DESC
        LIMIT 5
      ) t
    ),
    'common_failure_reasons', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', t.label, 'count', t.cnt)), '[]'::jsonb)
      FROM (
        SELECT co.label, COUNT(*) as cnt
        FROM analysis_events ae
        JOIN concepts co ON ae.concept_id = co.id
        WHERE ae.user_id = p_user_id AND ae.type = 'FAILURE_REASON'
        AND ae.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY co.label
        ORDER BY cnt DESC
        LIMIT 5
      ) t
    )
  )
  INTO v_result
  FROM days
  WHERE user_id = p_user_id AND date >= CURRENT_DATE - INTERVAL '30 days';

  RETURN COALESCE(v_result, jsonb_build_object('user_id', p_user_id, 'avg_completion', 0, 'days_count', 0, 'top_concepts', '[]', 'common_failure_reasons', '[]'));
END;
$$ LANGUAGE plpgsql;
