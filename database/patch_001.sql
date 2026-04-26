-- Patch : corrige get_user_patterns et retire RLS des tables auth

DROP FUNCTION IF EXISTS get_user_patterns(UUID);

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

  RETURN COALESCE(v_result, jsonb_build_object('user_id', p_user_id, 'avg_completion', 0, 'days_count', 0, 'top_concepts', '[]'::jsonb, 'common_failure_reasons', '[]'::jsonb));
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS auth_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS password_resets DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_sessions_user_isolation ON auth_sessions;
DROP POLICY IF EXISTS password_resets_user_isolation ON password_resets;
