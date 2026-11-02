CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id),

  url text NOT NULL,

  signing_secret_ref text NOT NULL,

  enabled boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_webhook_endpoint_https
    CHECK (url ~* '^https://[^[:space:]]+$'),

  CONSTRAINT chk_webhook_secret_ref
    CHECK (length(trim(signing_secret_ref)) > 0),

  CONSTRAINT uq_webhook_endpoint_tenant_id
    UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant
  ON webhook_endpoints (tenant_id)
  WHERE enabled = true;


CREATE TABLE IF NOT EXISTS webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES tenants(id),

  endpoint_id uuid NOT NULL,

  job_id uuid NOT NULL REFERENCES jobs(id),

  event_type text NOT NULL CHECK (
    event_type IN ('job.completed', 'job.failed')
  ),

  payload jsonb NOT NULL,

  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'delivered', 'failed')
  ),

  attempts integer NOT NULL DEFAULT 0,

  max_attempts integer NOT NULL DEFAULT 5,

  available_at timestamptz NOT NULL DEFAULT now(),

  lease_owner text,
  lease_until timestamptz,

  last_error text,

  delivered_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_webhook_outbox_endpoint_tenant
    FOREIGN KEY (tenant_id, endpoint_id)
    REFERENCES webhook_endpoints (tenant_id, id),

  CONSTRAINT chk_webhook_attempts
    CHECK (
      attempts >= 0
      AND max_attempts > 0
      AND attempts <= max_attempts
    ),

  CONSTRAINT chk_webhook_processing_lease
    CHECK (
      (
        status = 'processing'
        AND lease_owner IS NOT NULL
        AND lease_until IS NOT NULL
      )
      OR
      (
        status <> 'processing'
        AND lease_owner IS NULL
        AND lease_until IS NULL
      )
    ),

  CONSTRAINT chk_webhook_delivered_at
    CHECK (
      (status = 'delivered' AND delivered_at IS NOT NULL)
      OR
      (status <> 'delivered' AND delivered_at IS NULL)
    ),

  CONSTRAINT uq_webhook_job_event_endpoint
    UNIQUE (job_id, event_type, endpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_claim
  ON webhook_outbox (available_at, created_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_expired
  ON webhook_outbox (lease_until)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_tenant
  ON webhook_outbox (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_job
  ON webhook_outbox (job_id);
