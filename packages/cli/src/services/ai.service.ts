import type {
	AiApplySuggestionRequestDto,
	AiAskRequestDto,
	AiChatRequestDto,
	AiGenerateVersionDescriptionRequestDto,
} from '@n8n/api-types';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { AiAssistantClient } from '@n8n_io/ai-assistant-sdk';
import { InstanceSettings } from 'n8n-core';
import { assert, type IUser } from 'n8n-workflow';

import { N8N_VERSION } from '../constants';
import { License } from '../license';

@Service()
export class AiService {
	private client: AiAssistantClient | undefined;

	constructor(
		private readonly licenseService: License,
		private readonly globalConfig: GlobalConfig,
		private readonly instanceSettings: InstanceSettings,
	) {}

	async init() {
		const aiAssistantEnabled = this.licenseService.isAiAssistantEnabled();

		if (!aiAssistantEnabled) {
			return;
		}

		const licenseCert = await this.licenseService.loadCertStr();
		const consumerId = this.licenseService.getConsumerId();
		const baseUrl = this.globalConfig.aiAssistant.baseUrl;
		const logLevel = this.globalConfig.logging.level;

		this.client = new AiAssistantClient({
			licenseCert,
			consumerId,
			n8nVersion: N8N_VERSION,
			baseUrl,
			logLevel,
			instanceId: this.instanceSettings.instanceId,
		});

		// Register for license certificate updates
		this.licenseService.onCertRefresh((cert) => {
			this.client?.updateLicenseCert(cert);
		});
	}

	async chat(payload: AiChatRequestDto, user: IUser) {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.chat(payload, { id: user.id });
	}

	async applySuggestion(payload: AiApplySuggestionRequestDto, user: IUser) {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.applySuggestion(payload, { id: user.id });
	}

	async askAi(payload: AiAskRequestDto, user: IUser) {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.askAi(payload, { id: user.id });
	}

	async generateVersionDescription(
		payload: AiGenerateVersionDescriptionRequestDto,
		user: IUser,
	): Promise<{ name: string; description: string }> {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		const { accessToken, tokenType } = await this.client.getBuilderApiProxyToken({ id: user.id });
		const proxyBaseUrl = this.client.getApiProxyBaseUrl();

		const prompt = this.buildVersionDescriptionPrompt(payload);

		const response = await fetch(`${proxyBaseUrl}/anthropic/v1/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `${tokenType} ${accessToken}`,
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-5-20250929',
				max_tokens: 1024,
				system:
					'You generate concise version names and descriptions for n8n workflow automation versions. ' +
					'Version names should be descriptive and specific to what the workflow does or what changed (e.g. "Add Slack notification step", "Filter inactive users", "Handle CSV export"). ' +
					'NEVER use generic names like "Initial Version" or "Version 1". ' +
					'Always respond with ONLY valid JSON in this exact format: ' +
					'{"name": "short version name (max 100 chars)", "description": "description of changes (max 500 chars)"}',
				messages: [{ role: 'user', content: prompt }],
			}),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(
				`AI proxy request failed with status ${response.status.toString()}: ${errorBody}`,
			);
		}

		const data = (await response.json()) as {
			content: Array<{ type: string; text: string }>;
		};
		const content = data.content?.find((c) => c.type === 'text')?.text ?? '';

		return this.parseVersionDescriptionResponse(content);
	}

	private summarizeNode(n: Record<string, unknown>): Record<string, unknown> {
		return {
			name: n.name,
			type: n.type,
			parameters: n.parameters,
		};
	}

	private buildVersionDescriptionPrompt(payload: AiGenerateVersionDescriptionRequestDto): string {
		const currentNodes = payload.currentVersion.nodes.map((n) =>
			this.summarizeNode(n as Record<string, unknown>),
		);

		let prompt =
			`Generate a short version name and description for a workflow called "${payload.workflowName}".\n\n` +
			`Current workflow nodes: ${JSON.stringify(currentNodes)}\n` +
			`Current connections: ${JSON.stringify(payload.currentVersion.connections)}\n`;

		if (payload.previousVersion) {
			const prevNodes = payload.previousVersion.nodes.map((n) =>
				this.summarizeNode(n as Record<string, unknown>),
			);
			prompt +=
				'\nPrevious version nodes: ' +
				JSON.stringify(prevNodes) +
				'\nPrevious connections: ' +
				JSON.stringify(payload.previousVersion.connections) +
				'\n\nDescribe what changed between the two versions. Focus on parameter changes, added/removed nodes, and connection changes.';
		} else {
			prompt +=
				'\nThis is the first version. Summarize what the workflow does based on the nodes and their configuration.';
		}

		return prompt;
	}

	private parseVersionDescriptionResponse(content: string): { name: string; description: string } {
		try {
			const jsonMatch = content.match(/\{[\s\S]*"name"[\s\S]*"description"[\s\S]*\}/);
			const parsed: unknown = JSON.parse(jsonMatch ? jsonMatch[0] : content);

			if (
				typeof parsed === 'object' &&
				parsed !== null &&
				'name' in parsed &&
				'description' in parsed &&
				typeof (parsed as Record<string, unknown>).name === 'string' &&
				typeof (parsed as Record<string, unknown>).description === 'string'
			) {
				return {
					name: ((parsed as Record<string, unknown>).name as string).slice(0, 100),
					description: ((parsed as Record<string, unknown>).description as string).slice(0, 500),
				};
			}
		} catch {}

		return {
			name: '',
			description: content.slice(0, 500),
		};
	}

	async createFreeAiCredits(user: IUser) {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.generateAiCreditsCredentials(user);
	}
}
