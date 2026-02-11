import { DateTimeColumn, JsonColumn, User, WithTimestampsAndStringId } from '@n8n/db';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from '@n8n/typeorm';

@Entity({ name: 'audit_log' })
export class AuditLog extends WithTimestampsAndStringId {
	@PrimaryColumn('varchar')
	id: string;

	@Column('varchar', { length: 255 })
	eventName: string;

	@Column('text')
	message: string;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'userId' })
	user: Relation<User> | null;

	@Column({ nullable: true })
	userId: string | null;

	@DateTimeColumn()
	timestamp: Date;

	@JsonColumn()
	payload: Record<string, unknown>;
}
