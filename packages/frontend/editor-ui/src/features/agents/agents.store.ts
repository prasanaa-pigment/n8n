import { ref } from 'vue';
import { defineStore } from 'pinia';
import { makeRestApiRequest } from '@n8n/rest-api-client';
import { useRootStore } from '@n8n/stores/useRootStore';

export interface AgentNode {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	role: string;
	emoji: string;
	status: 'idle' | 'active' | 'busy';
	position: { x: number; y: number };
}

interface UserResponse {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	type?: string;
}

const AGENT_METADATA: Record<string, { role: string; emoji: string }> = {
	'agent-docs-curator@internal.n8n.local': { role: 'Knowledge Base', emoji: '\u{1F4DA}' },
	'agent-issue-triager@internal.n8n.local': { role: 'Bug Analysis', emoji: '\u{1F50D}' },
	'agent-qa@internal.n8n.local': { role: 'Test Strategy', emoji: '\u{1F916}' },
	'agent-messenger@internal.n8n.local': { role: 'Comms & Alerts', emoji: '\u{1F4AC}' },
};

const DEFAULT_POSITIONS: { x: number; y: number }[] = [
	{ x: 80, y: 60 },
	{ x: 350, y: 60 },
	{ x: 80, y: 260 },
	{ x: 350, y: 260 },
];

export const useAgentsStore = defineStore('agents', () => {
	const agents = ref<AgentNode[]>([]);
	const rootStore = useRootStore();

	const fetchAgents = async () => {
		const response = await makeRestApiRequest<{ items: UserResponse[] }>(
			rootStore.restApiContext,
			'GET',
			'/users',
			{ take: 100, skip: 0 },
		);

		const agentUsers = response.items.filter(
			(u) => u.type === 'agent' || u.email?.endsWith('@internal.n8n.local'),
		);

		agents.value = agentUsers.map((user, index) => {
			const meta = AGENT_METADATA[user.email] ?? { role: 'Agent', emoji: '\u{1F916}' };
			return {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				role: meta.role,
				emoji: meta.emoji,
				status: 'idle' as const,
				position: DEFAULT_POSITIONS[index % DEFAULT_POSITIONS.length],
			};
		});
	};

	const updatePosition = (id: string, position: { x: number; y: number }) => {
		const agent = agents.value.find((a) => a.id === id);
		if (agent) {
			agent.position = position;
		}
	};

	return { agents, fetchAgents, updatePosition };
});
