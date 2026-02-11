import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import type { AiCodeCompletionRequestDto } from '@n8n/api-types';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

interface CodestralFimResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

@Service()
export class AiCodeCompletionService {
	private readonly apiKey: string;

	constructor(globalConfig: GlobalConfig) {
		this.apiKey = globalConfig.ai.codestralApiKey;
	}

	async getCompletion(payload: AiCodeCompletionRequestDto): Promise<{ completion: string }> {
		if (!this.apiKey) {
			throw new BadRequestError(
				'Codestral API key not configured. Set N8N_AI_CODESTRAL_API_KEY environment variable.',
			);
		}

		const response = await fetch('https://api.mistral.ai/v1/fim/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: 'codestral-2508',
				prompt: payload.codeBeforeCursor,
				suffix: payload.codeAfterCursor ?? '',
				max_tokens: 150,
				temperature: 0,
				stop: ['\n\n'],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new BadRequestError(`Codestral API error: ${response.status} ${errorText}`);
		}

		const data = (await response.json()) as CodestralFimResponse;
		const completion = data.choices?.[0]?.message?.content ?? '';

		return { completion };
	}
}
