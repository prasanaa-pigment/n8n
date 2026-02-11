import type { IRestApiContext } from '@n8n/rest-api-client';
import { makeRestApiRequest } from '@n8n/rest-api-client';
import type { IDataObject } from 'n8n-workflow';

export async function fetchCodeCompletion(
	context: IRestApiContext,
	payload: {
		codeBeforeCursor: string;
		codeAfterCursor: string;
		language: string;
		mode?: string;
		inputSchema?: string;
	},
): Promise<string | null> {
	const response = await makeRestApiRequest<{ completion: string }>(
		context,
		'POST',
		'/ai/code-completion',
		payload as unknown as IDataObject,
	);
	return response.completion || null;
}

export async function fetchCodeGeneration(
	context: IRestApiContext,
	payload: {
		prompt: string;
		language: string;
		mode?: string;
		existingCode?: string;
		inputSchema?: string;
	},
): Promise<string | null> {
	const response = await makeRestApiRequest<{ code: string }>(
		context,
		'POST',
		'/ai/code-generation',
		payload as unknown as IDataObject,
	);
	return response.code || null;
}
