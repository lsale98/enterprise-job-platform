
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  subject text PRIMARY KEY,
  email text NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  subject text NOT NULL REFERENCES identities(subject),
  role text NOT NULL CHECK (
    role IN ('viewer', 'operator', 'admin')
  ),
  PRIMARY KEY (tenant_id, subject)
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  created_by text NOT NULL REFERENCES identities(subject),
  type text NOT NULL CHECK (
    type IN ('report', 'import', 'notification')
  ),
  input jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  lease_owner text,
  lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_job_claim
  ON jobs (available_at, created_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_created
  ON jobs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS imported_records (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_id text NOT NULL,
  value double precision NOT NULL,
  source_job uuid NOT NULL REFERENCES jobs(id),
  PRIMARY KEY (tenant_id, external_id)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL UNIQUE REFERENCES jobs(id),
  subject text NOT NULL,
  body text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'delivered')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor text NOT NULL,
  action text NOT NULL,
  resource_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant
  ON audit_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL,
  body text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_tenant
  ON knowledge_documents (tenant_id);
