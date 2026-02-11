import { Service } from '@n8n/di';
import { DataSource, Repository } from '@n8n/typeorm';

import { AuditLog } from '../entities';

@Service()
export class AuditLogRepository extends Repository<AuditLog> {
	constructor(dataSource: DataSource) {
		super(AuditLog, dataSource.manager);
	}
}
