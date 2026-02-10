import { Logger } from '@n8n/backend-common';
import { GLOBAL_MEMBER_ROLE, UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';

const AGENT_USERS = [
	{
		firstName: 'Docs Curator',
		lastName: '📚',
		email: 'agent-docs-curator@internal.n8n.local',
		role: 'Knowledge Base',
	},
	{
		firstName: 'Issue Triager',
		lastName: '🔍',
		email: 'agent-issue-triager@internal.n8n.local',
		role: 'Bug Analysis',
	},
	{
		firstName: 'QA Agent',
		lastName: '🤖',
		email: 'agent-qa@internal.n8n.local',
		role: 'Test Strategy',
	},
	{
		firstName: 'Messenger',
		lastName: '💬',
		email: 'agent-messenger@internal.n8n.local',
		role: 'Comms & Alerts',
	},
];

@Service()
export class AgentSeederService {
	constructor(
		private readonly logger: Logger,
		private readonly userRepository: UserRepository,
	) {}

	async seed() {
		const existingAgents = await this.userRepository.find({ where: { type: 'agent' } });
		if (existingAgents.length > 0) {
			this.logger.debug(`Found ${existingAgents.length} agent users, skipping seed`);
			return;
		}

		this.logger.info('Seeding agent users...');

		for (const agent of AGENT_USERS) {
			await this.userRepository.createUserWithProject({
				email: agent.email,
				firstName: agent.firstName,
				lastName: agent.lastName,
				password: null,
				type: 'agent',
				role: GLOBAL_MEMBER_ROLE,
			});
			this.logger.info(`Created agent user: ${agent.firstName}`);
		}

		this.logger.info(`Seeded ${AGENT_USERS.length} agent users`);
	}
}
