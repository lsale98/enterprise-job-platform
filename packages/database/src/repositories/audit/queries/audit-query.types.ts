export interface JobAuditEvent {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  resourceId: string;
  createdAt: string;
}

export interface ListJobAuditEventsParams {
  tenantId: string;
  jobId: string;
  limit?: number;
}

export interface JobAuditEventRow extends Omit<JobAuditEvent, "createdAt"> {
  createdAt: Date;
}
