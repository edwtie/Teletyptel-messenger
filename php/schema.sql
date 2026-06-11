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
  KEY idx_account_verification_identifier (identifier(190), purpose, created_at),
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

CREATE TABLE IF NOT EXISTS message_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(96) NOT NULL,
  conversation_peer VARCHAR(255) NOT NULL,
  conversation_name VARCHAR(255) NOT NULL DEFAULT '',
  conversation_kind VARCHAR(32) NOT NULL DEFAULT 'contact',
  message_id VARCHAR(160) NOT NULL,
  direction VARCHAR(16) NOT NULL,
  sender_jid VARCHAR(255) NOT NULL DEFAULT '',
  text MEDIUMTEXT NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT '',
  attachment_json MEDIUMTEXT NULL,
  location_json MEDIUMTEXT NULL,
  styling_disabled TINYINT(1) NOT NULL DEFAULT 0,
  edited TINYINT(1) NOT NULL DEFAULT 0,
  retracted TINYINT(1) NOT NULL DEFAULT 0,
  retraction_json MEDIUMTEXT NULL,
  message_timestamp DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_message_history_account_message (account_id, message_id),
  KEY idx_message_history_account_peer_time (account_id, conversation_peer, message_timestamp),
  CONSTRAINT fk_message_history_account
    FOREIGN KEY (account_id) REFERENCES account_profiles(account_id)
    ON DELETE CASCADE
);
