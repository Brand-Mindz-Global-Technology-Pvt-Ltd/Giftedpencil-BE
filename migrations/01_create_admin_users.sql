-- ==============================================================================
-- THE GIFTED PENCIL - ADMIN USERS TABLE MIGRATION (LOCAL DATABASE ONLY)
-- Target Database: gifted_pencil_test (Local MySQL)
-- Safety: Non-destructive, uses CREATE TABLE IF NOT EXISTS.
-- DO NOT EXECUTE ON PRODUCTION.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_uuid` VARCHAR(36) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `role` ENUM('superadmin', 'admin', 'manager', 'support') NOT NULL DEFAULT 'admin',
  `avatar_url` VARCHAR(500) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_uuid` (`admin_uuid`),
  UNIQUE KEY `uq_admin_email` (`email`),
  UNIQUE KEY `uq_admin_username` (`username`),
  KEY `idx_admin_role_status` (`role`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
