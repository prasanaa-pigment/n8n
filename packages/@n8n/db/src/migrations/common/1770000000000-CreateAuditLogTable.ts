import type { MigrationContext, ReversibleMigration } from '../migration-types';

const tableName = 'audit_log';

export class CreateAuditLogTable1770000000000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, column } }: MigrationContext) {
		await createTable(tableName).withColumns(
			column('id').varchar(255).primary.notNull,
			column('eventName').varchar(255).notNull,
			column('message').text.notNull,
			column('timestamp').timestampTimezone().notNull,
			column('payload').json.notNull,
		).withTimestamps;
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable(tableName);
	}
}
