
CREATE INDEX IF NOT EXISTS idx_memberships_subject_tenant
  ON memberships (subject, tenant_id);

CREATE TABLE IF NOT EXISTS platform_role_assignments (
  subject text NOT NULL REFERENCES identities(subject),
  role text NOT NULL CHECK (role = 'platform_admin'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject, role)
);
