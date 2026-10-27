CREATE DATABASE IF NOT EXISTS teletyptel
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE teletyptel;

CREATE TABLE IF NOT EXISTS account_profiles (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  jid VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_secret TEXT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  remember_password TINYINT(1) NOT NULL DEFAULT 0,
  phone_number VARCHAR(64) NOT NULL DEFAULT '',
  birth_date VARCHAR(10) NOT NULL DEFAULT '',
  provider_id VARCHAR(96) NOT NULL DEFAULT 'example-provider',
  accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT 'default-live-text',
  preferred_language VARCHAR(16) NOT NULL DEFAULT 'nl',
  live_rtt_enabled TINYINT(1) NOT NULL DEFAULT 1,
  show_smileys TINYINT(1) NOT NULL DEFAULT 1,
  session_timeout_enabled TINYINT(1) NOT NULL DEFAULT 1,
  subscription_plan VARCHAR(32) NOT NULL DEFAULT 'free',
  account_status VARCHAR(32) NOT NULL DEFAULT 'active',
  subscription_expires_at DATE NULL,
  admin_note TEXT NULL,
  relay_websocket VARCHAR(255) NOT NULL DEFAULT 'ws://127.0.0.1:8787',
  xmpp_websocket VARCHAR(255) NOT NULL DEFAULT 'ws://127.0.0.1:8787',
  xmpp_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
  xmpp_port INT NOT NULL DEFAULT 5222,
  xmpp_domain VARCHAR(255) NOT NULL DEFAULT 'localhost',
  xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT 'starttls',
  peer VARCHAR(255) NOT NULL DEFAULT 'relay@localhost',
  avatar_data_url MEDIUMTEXT NULL,
  avatar_color VARCHAR(32) NOT NULL DEFAULT '#2563eb',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_profiles_jid (jid)
);

CREATE TABLE IF NOT EXISTS accounts (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  phone_number VARCHAR(64) NOT NULL DEFAULT '',
  birth_date VARCHAR(10) NOT NULL DEFAULT '',
  provider_id VARCHAR(96) NOT NULL DEFAULT 'example-provider',
  accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT 'default-live-text',
  preferred_language VARCHAR(16) NOT NULL DEFAULT 'nl',
  avatar_data_url MEDIUMTEXT NULL,
  avatar_color VARCHAR(32) NOT NULL DEFAULT '#2563eb',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  UNIQUE KEY uq_account_identity_provider_subject (provider, provider_subject(190)),
  KEY idx_account_identity_account (account_id),
  KEY idx_account_identity_email (email(190)),
  CONSTRAINT fk_account_identity_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_credentials (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  password_updated_at DATETIME NOT NULL,
  CONSTRAINT fk_account_credentials_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_xmpp (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  xmpp_jid VARCHAR(255) NOT NULL,
  xmpp_domain VARCHAR(255) NOT NULL DEFAULT 'localhost',
  xmpp_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
  xmpp_port INT NOT NULL DEFAULT 5222,
  xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT 'starttls',
  xmpp_websocket VARCHAR(255) NOT NULL DEFAULT 'ws://127.0.0.1:8787',
  peer VARCHAR(255) NOT NULL DEFAULT 'relay@localhost',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_xmpp_jid (xmpp_jid),
  CONSTRAINT fk_account_xmpp_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jid VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  request_ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_jid_created (jid(190), created_at)
);

CREATE TABLE IF NOT EXISTS account_mail_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jid VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  reset_link VARCHAR(1024) NOT NULL DEFAULT '',
  sent TINYINT(1) NOT NULL DEFAULT 0,
  error_text VARCHAR(512) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_account_mail_log_jid_created (jid(190), created_at)
);

CREATE TABLE IF NOT EXISTS account_verification_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL DEFAULT '',
  purpose VARCHAR(64) NOT NULL,
  identity_type VARCHAR(32) NOT NULL DEFAULT 'email',
  identifier VARCHAR(255) NOT NULL,
  target_jid VARCHAR(255) NOT NULL DEFAULT '',
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  request_ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_verification_code_hash (code_hash),
  KEY idx_account_verification_identifier (identifier(150), purpose, created_at),
  KEY idx_account_verification_account (account_id, created_at)
);

CREATE TABLE IF NOT EXISTS account_security_settings (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_method VARCHAR(32) NOT NULL DEFAULT 'email_code',
  two_factor_secret VARCHAR(128) NOT NULL DEFAULT '',
  two_factor_pending_secret VARCHAR(128) NOT NULL DEFAULT '',
  two_factor_confirmed_at DATETIME NULL,
  recovery_email VARCHAR(255) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_access_controls (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  web_blocked TINYINT(1) NOT NULL DEFAULT 0,
  trashed_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_account_access_profile FOREIGN KEY (account_id) REFERENCES account_profiles(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  admin_id VARCHAR(96) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'owner',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  can_review_intake TINYINT NOT NULL DEFAULT 0,
  session_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  UNIQUE KEY uq_admin_users_email (email(190))
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(96) NOT NULL,
  action VARCHAR(40) NOT NULL,
  target_account_id VARCHAR(96) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  KEY idx_admin_audit_target (target_account_id, created_at)
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  price_cents INT UNSIGNED NULL,
  billing_period VARCHAR(16) NOT NULL DEFAULT 'month',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscription_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  from_plan VARCHAR(32) NOT NULL,
  to_plan VARCHAR(32) NOT NULL,
  from_plan_name VARCHAR(120) NOT NULL,
  to_plan_name VARCHAR(120) NOT NULL,
  from_expires_at DATE NULL,
  to_expires_at DATE NULL,
  actor_id VARCHAR(96) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_subscription_history_account (account_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscription_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  expected_plan VARCHAR(32) NOT NULL,
  expected_expires_at DATE NULL,
  to_plan VARCHAR(32) NOT NULL,
  to_expires_at DATE NULL,
  effective_on DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  actor_id VARCHAR(96) NOT NULL,
  note TEXT NOT NULL,
  error_code VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  KEY idx_schedule_due (status, effective_on),
  KEY idx_schedule_account (account_id, status)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  request_key VARCHAR(64) NOT NULL UNIQUE,
  account_id VARCHAR(96) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL DEFAULT 'customer',
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  invoice_number VARCHAR(64) NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  customer_address TEXT NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  service_on DATE NOT NULL,
  due_on DATE NOT NULL,
  quantity INT NOT NULL,
  unit_cents BIGINT NOT NULL,
  vat_basis_points INT NOT NULL,
  subtotal_cents BIGINT NOT NULL,
  vat_cents BIGINT NOT NULL,
  total_cents BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  supplier_json TEXT NULL,
  issued_on DATE NULL,
  paid_on DATE NULL,
  payment_reference VARCHAR(128) NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  actor_id VARCHAR(96) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_invoice_account (account_id, created_at)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_sequences (
  sequence_year INT NOT NULL PRIMARY KEY,
  last_number BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS billing_recurring (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL UNIQUE,
  recipient_type VARCHAR(16) NOT NULL DEFAULT 'customer',
  plan_id VARCHAR(32) NOT NULL,
  plan_version INT NOT NULL,
  unit_cents BIGINT NOT NULL,
  billing_period VARCHAR(16) NOT NULL,
  anchor_day INT NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_address TEXT NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  vat_basis_points INT NOT NULL,
  next_on DATE NOT NULL,
  enabled TINYINT NOT NULL,
  auto_issue TINYINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  last_error VARCHAR(128) NOT NULL DEFAULT '',
  actor_id VARCHAR(96) NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_recurring_due (enabled, next_on)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  conversation_peer VARCHAR(255) NOT NULL,
  conversation_name VARCHAR(255) NOT NULL DEFAULT '',
  conversation_kind VARCHAR(32) NOT NULL DEFAULT 'contact',
  message_id VARCHAR(150) NOT NULL,
  direction VARCHAR(16) NOT NULL,
  sender_jid VARCHAR(255) NOT NULL DEFAULT '',
  text MEDIUMTEXT NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT '',
  attachment_json MEDIUMTEXT NULL,
  location_json MEDIUMTEXT NULL,
  call_info_json MEDIUMTEXT NULL,
  styling_disabled TINYINT(1) NOT NULL DEFAULT 0,
  edited TINYINT(1) NOT NULL DEFAULT 0,
  retracted TINYINT(1) NOT NULL DEFAULT 0,
  retraction_json MEDIUMTEXT NULL,
  message_timestamp DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_message_history_account_message (account_id, message_id),
  KEY idx_message_history_account_peer_time (account_id, conversation_peer(120), message_timestamp),
  CONSTRAINT fk_message_history_account
    FOREIGN KEY (account_id) REFERENCES account_profiles(account_id)
    ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS conversation_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  call_id VARCHAR(150) NOT NULL,
  conversation_peer VARCHAR(255) NOT NULL,
  conversation_name VARCHAR(255) NOT NULL DEFAULT '',
  conversation_kind VARCHAR(32) NOT NULL DEFAULT 'contact',
  direction VARCHAR(16) NOT NULL,
  call_type VARCHAR(32) NOT NULL DEFAULT 'total',
  status VARCHAR(32) NOT NULL DEFAULT 'ended',
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  transcript_json MEDIUMTEXT NULL,
  media_json MEDIUMTEXT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversation_history_account_call (account_id, call_id),
  KEY idx_conversation_history_account_peer_time (account_id, conversation_peer(120), started_at),
  CONSTRAINT fk_conversation_history_account
    FOREIGN KEY (account_id) REFERENCES account_profiles(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS translation_preferences (
  account_id VARCHAR(96) NOT NULL PRIMARY KEY,
  target_language VARCHAR(16) NOT NULL DEFAULT 'nl',
  translation_mode VARCHAR(16) NOT NULL DEFAULT 'manual',
  automatic_consent INTEGER NOT NULL DEFAULT 0,
  live_rtt_consent INTEGER NOT NULL DEFAULT 0,
  own_live_rtt_consent INTEGER NOT NULL DEFAULT 0
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS translation_usage (
  scope_key VARCHAR(128) NOT NULL,
  window_start BIGINT NOT NULL,
  window_end BIGINT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  characters INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_key, window_start)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
