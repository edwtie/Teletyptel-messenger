CREATE TABLE IF NOT EXISTS intake_plan_rules (
  plan_id VARCHAR(32) NOT NULL PRIMARY KEY,
  published TINYINT NOT NULL DEFAULT 0,
  requires_documents TINYINT NOT NULL DEFAULT 0,
  requires_bsn TINYINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS intake_applications (
  id CHAR(32) NOT NULL PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  plan_id VARCHAR(32) NOT NULL,
  plan_version INT NOT NULL,
  rule_version INT NOT NULL,
  plan_name VARCHAR(120) NOT NULL,
  price_cents INT NULL,
  billing_period VARCHAR(16) NOT NULL,
  requires_documents TINYINT NOT NULL,
  requires_bsn TINYINT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  payload MEDIUMTEXT NULL,
  consent_version VARCHAR(64) NOT NULL DEFAULT '',
  feedback_code VARCHAR(32) NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  KEY idx_intake_account (account_id, created_at),
  KEY idx_intake_status (status, created_at),
  KEY idx_intake_expiry (expires_at)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS intake_documents (
  id CHAR(32) NOT NULL PRIMARY KEY,
  application_id CHAR(32) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  extension VARCHAR(5) NOT NULL,
  file_size INT NOT NULL,
  encrypted_content MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_intake_document_kind (application_id, kind)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS intake_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(128) NOT NULL,
  action VARCHAR(40) NOT NULL,
  application_id VARCHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  KEY idx_intake_audit_application (application_id, created_at)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
