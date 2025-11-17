/**
 * Database Migration Runner
 * Manages database schema migrations
 */
import { db } from './client';
import logger from '@utils/logger';
import { DatabaseError } from '@utils/errors';

interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_policies_table',
    up: `
      CREATE TABLE IF NOT EXISTS policies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(50) NOT NULL,
        namespace VARCHAR(255) NOT NULL,
        tags TEXT[] DEFAULT '{}',
        priority INTEGER DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        rules JSONB NOT NULL,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_policies_namespace ON policies(namespace);
      CREATE INDEX idx_policies_status ON policies(status);
      CREATE INDEX idx_policies_priority ON policies(priority DESC);
      CREATE INDEX idx_policies_created_at ON policies(created_at DESC);
    `,
    down: `
      DROP TABLE IF EXISTS policies;
    `,
  },
  {
    version: 2,
    name: 'create_policy_evaluations_table',
    up: `
      CREATE TABLE IF NOT EXISTS policy_evaluations (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(255) NOT NULL,
        policy_ids TEXT[] DEFAULT '{}',
        decision VARCHAR(50) NOT NULL,
        allowed BOOLEAN NOT NULL,
        reason TEXT,
        matched_policies TEXT[] DEFAULT '{}',
        matched_rules TEXT[] DEFAULT '{}',
        context JSONB,
        evaluation_time_ms INTEGER,
        cached BOOLEAN DEFAULT false,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_evaluations_request_id ON policy_evaluations(request_id);
      CREATE INDEX idx_evaluations_decision ON policy_evaluations(decision);
      CREATE INDEX idx_evaluations_allowed ON policy_evaluations(allowed);
      CREATE INDEX idx_evaluations_created_at ON policy_evaluations(created_at DESC);
      CREATE INDEX idx_evaluations_policy_ids ON policy_evaluations USING GIN(policy_ids);
    `,
    down: `
      DROP TABLE IF EXISTS policy_evaluations;
    `,
  },
  {
    version: 3,
    name: 'create_migrations_table',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS schema_migrations;
    `,
  },
];

export class MigrationRunner {
  /**
   * Run all pending migrations
   */
  async up(): Promise<void> {
    try {
      logger.info('Starting database migrations');

      // Ensure migrations table exists
      await this.ensureMigrationsTable();

      // Get applied migrations
      const appliedVersions = await this.getAppliedVersions();

      // Find pending migrations
      const pendingMigrations = migrations
        .filter((m) => !appliedVersions.includes(m.version))
        .sort((a, b) => a.version - b.version);

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      // Run each pending migration
      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
      }

      logger.info(
        { count: pendingMigrations.length },
        'Database migrations completed successfully',
      );
    } catch (error) {
      logger.error({ error }, 'Database migration failed');
      throw new DatabaseError(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Rollback last migration
   */
  async down(): Promise<void> {
    try {
      logger.info('Rolling back last migration');

      await this.ensureMigrationsTable();

      const appliedVersions = await this.getAppliedVersions();
      if (appliedVersions.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const lastVersion = Math.max(...appliedVersions);
      const migration = migrations.find((m) => m.version === lastVersion);

      if (!migration || !migration.down) {
        throw new Error(`Cannot rollback migration version ${lastVersion}`);
      }

      await this.rollbackMigration(migration);

      logger.info({ version: lastVersion }, 'Migration rolled back successfully');
    } catch (error) {
      logger.error({ error }, 'Migration rollback failed');
      throw new DatabaseError(
        `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    applied: Migration[];
    pending: Migration[];
  }> {
    try {
      await this.ensureMigrationsTable();

      const appliedVersions = await this.getAppliedVersions();

      const applied = migrations
        .filter((m) => appliedVersions.includes(m.version))
        .sort((a, b) => a.version - b.version);

      const pending = migrations
        .filter((m) => !appliedVersions.includes(m.version))
        .sort((a, b) => a.version - b.version);

      return { applied, pending };
    } catch (error) {
      throw new DatabaseError(
        `Failed to get migration status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reset database (rollback all migrations)
   */
  async reset(): Promise<void> {
    try {
      logger.warn('Resetting database - all data will be lost');

      await this.ensureMigrationsTable();

      const appliedVersions = await this.getAppliedVersions();
      const appliedMigrations = migrations
        .filter((m) => appliedVersions.includes(m.version))
        .sort((a, b) => b.version - a.version); // Reverse order for rollback

      for (const migration of appliedMigrations) {
        if (migration.down) {
          await this.rollbackMigration(migration);
        }
      }

      logger.info('Database reset completed');
    } catch (error) {
      logger.error({ error }, 'Database reset failed');
      throw new DatabaseError(
        `Reset failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensure migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    const migrationTableMigration = migrations.find((m) => m.name === 'create_migrations_table');
    if (migrationTableMigration) {
      await db.query(migrationTableMigration.up);
    }
  }

  /**
   * Get list of applied migration versions
   */
  private async getAppliedVersions(): Promise<number[]> {
    try {
      const result = await db.query('SELECT version FROM schema_migrations ORDER BY version');
      return result.rows.map((row) => row.version);
    } catch (error) {
      // Table doesn't exist yet
      return [];
    }
  }

  /**
   * Run a single migration
   */
  private async runMigration(migration: Migration): Promise<void> {
    await db.transaction(async (client) => {
      logger.info({ version: migration.version, name: migration.name }, 'Running migration');

      // Execute migration SQL
      await client.query(migration.up);

      // Record migration
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );

      logger.info(
        { version: migration.version, name: migration.name },
        'Migration completed',
      );
    });
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(migration: Migration): Promise<void> {
    if (!migration.down) {
      throw new Error(`Migration ${migration.name} has no down migration`);
    }

    await db.transaction(async (client) => {
      logger.info(
        { version: migration.version, name: migration.name },
        'Rolling back migration',
      );

      // Execute rollback SQL
      await client.query(migration.down!);

      // Remove migration record
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);

      logger.info(
        { version: migration.version, name: migration.name },
        'Migration rolled back',
      );
    });
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2] || 'up';
  const runner = new MigrationRunner();

  (async () => {
    try {
      switch (command) {
        case 'up':
          await runner.up();
          break;
        case 'down':
          await runner.down();
          break;
        case 'status':
          const status = await runner.status();
          console.log('\nApplied migrations:');
          status.applied.forEach((m) => console.log(`  ✓ ${m.version} - ${m.name}`));
          console.log('\nPending migrations:');
          status.pending.forEach((m) => console.log(`  ○ ${m.version} - ${m.name}`));
          break;
        case 'reset':
          await runner.reset();
          break;
        default:
          console.error(`Unknown command: ${command}`);
          console.log('Available commands: up, down, status, reset');
          process.exit(1);
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Migration error:', error);
      await db.close();
      process.exit(1);
    }
  })();
}

export default MigrationRunner;
