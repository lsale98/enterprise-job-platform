
-- E3-S1 Database Schema Integration Tests
-- Run only against the local development database.
-- Requires migrations and local seed data.

-- Verify schema and seed data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'pgvector extension missing';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM schema_migrations
    WHERE filename = '001_init.sql'
  ) <> 1 THEN
    RAISE EXCEPTION 'Migration history is incorrect';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM tenants
    WHERE name IN ('Acme', 'Contoso')
  ) <> 2 THEN
    RAISE EXCEPTION 'Expected tenants missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_jobs_tenant_created'
  ) THEN
    RAISE EXCEPTION 'Job listing index missing';
  END IF;

  RAISE NOTICE 'Schema and seed checks: PASS';
END;
$$;

-- All data created in this transaction will be rolled back.

BEGIN;

DO $$
DECLARE
  duplicate_rejected boolean := false;
  invalid_tenant_rejected boolean := false;
  invalid_status_rejected boolean := false;
BEGIN

  -- Insert a valid job.

  INSERT INTO jobs (
    id,
    tenant_id,
    created_by,
    type,
    input,
    idempotency_key,
    request_hash
  )
  VALUES (
    '44444444-4444-4444-8444-444444444444',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'report',
    '{"type":"report","numbers":[1]}'::jsonb,
    'e3-s1-unique-test',
    'hash-one'
  );

  -- Duplicate tenant/idempotency key must fail.

  BEGIN
    INSERT INTO jobs (
      id,
      tenant_id,
      created_by,
      type,
      input,
      idempotency_key,
      request_hash
    )
    VALUES (
      '55555555-5555-4555-8555-555555555555',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'report',
      '{"type":"report","numbers":[2]}'::jsonb,
      'e3-s1-unique-test',
      'hash-two'
    );
  EXCEPTION
    WHEN unique_violation THEN
      duplicate_rejected := true;
  END;

  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'UNIQUE constraint test failed';
  END IF;

  -- Unknown tenant must fail.

  BEGIN
    INSERT INTO jobs (
      id,
      tenant_id,
      created_by,
      type,
      input,
      idempotency_key,
      request_hash
    )
    VALUES (
      '66666666-6666-4666-8666-666666666666',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '11111111-1111-4111-8111-111111111111',
      'report',
      '{"type":"report","numbers":[3]}'::jsonb,
      'e3-s1-fk-test',
      'hash-three'
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      invalid_tenant_rejected := true;
  END;

  IF NOT invalid_tenant_rejected THEN
    RAISE EXCEPTION 'Foreign key test failed';
  END IF;

  -- Invalid job status must fail.

  BEGIN
    INSERT INTO jobs (
      id,
      tenant_id,
      created_by,
      type,
      input,
      status,
      idempotency_key,
      request_hash
    )
    VALUES (
      '77777777-7777-4777-8777-777777777777',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'report',
      '{"type":"report","numbers":[4]}'::jsonb,
      'invalid-status',
      'e3-s1-status-test',
      'hash-four'
    );
  EXCEPTION
    WHEN check_violation THEN
      invalid_status_rejected := true;
  END;

  IF NOT invalid_status_rejected THEN
    RAISE EXCEPTION 'CHECK constraint test failed';
  END IF;

  RAISE NOTICE 'Constraint checks: PASS';
END;
$$;

ROLLBACK;

-- Verify that the valid test job was also discarded.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM jobs
    WHERE id = '44444444-4444-4444-8444-444444444444'
  ) THEN
    RAISE EXCEPTION 'Transaction rollback failed';
  END IF;

  RAISE NOTICE 'Transaction rollback: PASS';
END;
$$;
