import type { IExecuteFunctions, ISupplyDataFunctions } from 'n8n-workflow';

import { LangchainAdapter } from '../adapters/langchain';
import type { ChatModel } from '../types/chat-model';

export function supplyModel(this: ISupplyDataFunctions | IExecuteFunctions, model: ChatModel) {
	const adapter = new LangchainAdapter(model);
	return adapter;
}
