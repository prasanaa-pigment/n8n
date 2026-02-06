import type { ISupplyDataFunctions } from 'n8n-workflow';

import { supplyModel } from './supplyModel';

const mockChatOpenAIInstance = { __brand: 'ChatOpenAI' };
const mockLangchainAdapterInstance = { __brand: 'LangchainAdapter' };

jest.mock('@langchain/openai', () => ({
	ChatOpenAI: jest.fn().mockImplementation(() => mockChatOpenAIInstance),
}));

jest.mock('../utils/http-proxy-agent', () => ({
	getProxyAgent: jest.fn().mockReturnValue({ __agent: true }),
}));

jest.mock('../utils/n8n-llm-tracing', () => ({
	N8nLlmTracing: jest.fn().mockImplementation(function (this: unknown) {
		return this;
	}),
}));

jest.mock('../utils/failed-attempt-handler/n8nLlmFailedAttemptHandler', () => ({
	makeN8nLlmFailedAttemptHandler: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../adapters/langchain-chat-model', () => ({
	LangchainAdapter: jest.fn().mockImplementation(() => mockLangchainAdapterInstance),
}));

const { ChatOpenAI } = jest.requireMock('@langchain/openai');
const { LangchainAdapter } = jest.requireMock('../adapters/langchain-chat-model');

describe('supplyModel', () => {
	const mockCtx = {
		getNode: jest.fn(),
		addOutputData: jest.fn(),
		addInputData: jest.fn(),
		getNextRunIndex: jest.fn(),
	} as unknown as ISupplyDataFunctions;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('OpenAI model path', () => {
		it('returns response from ChatOpenAI when model has type "openai"', () => {
			const openAiModel = {
				type: 'openai' as const,
				baseUrl: 'https://api.openai.com',
				model: 'gpt-4',
				apiKey: 'test-key',
			};

			const result = supplyModel(mockCtx, openAiModel);

			expect(result).toEqual({ response: mockChatOpenAIInstance });
			expect(ChatOpenAI).toHaveBeenCalledTimes(1);
			expect(LangchainAdapter).not.toHaveBeenCalled();
		});

		it('passes ctx and OpenAI options to ChatOpenAI when model has defaultHeaders and timeout', () => {
			const openAiModel = {
				type: 'openai' as const,
				baseUrl: 'https://api.example.com',
				model: 'gpt-4',
				apiKey: 'key',
				defaultHeaders: { 'X-Custom': 'value' },
				timeout: 60_000,
			};

			supplyModel(mockCtx, openAiModel);

			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'gpt-4',
					apiKey: 'key',
					configuration: expect.objectContaining({
						baseURL: 'https://api.example.com',
						defaultHeaders: { 'X-Custom': 'value' },
					}),
				}),
			);
		});

		it('includes providerTools in metadata when model has providerTools', () => {
			supplyModel(mockCtx, {
				type: 'openai' as const,
				baseUrl: 'https://api.openai.com',
				model: 'gpt-4',
				apiKey: 'key',
				providerTools: [{ type: 'provider', name: 'web_search', args: { size: 'medium' } }],
			});

			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'gpt-4',
					apiKey: 'key',
				}),
			);
			const callArgs = (ChatOpenAI as jest.Mock).mock.calls[0][0];
			expect(callArgs).toBeDefined();
		});
	});

	describe('ChatModel (LangchainAdapter) path', () => {
		it('returns response from LangchainAdapter when model does not have type "openai"', () => {
			const chatModel = {
				provider: 'anthropic',
				modelId: 'claude-3',
				generate: jest.fn(),
				stream: jest.fn(),
				withTools: jest.fn().mockReturnThis(),
			};

			const result = supplyModel(mockCtx, chatModel);

			expect(result).toEqual({ response: mockLangchainAdapterInstance });
			expect(LangchainAdapter).toHaveBeenCalledTimes(1);
			expect(LangchainAdapter).toHaveBeenCalledWith(chatModel, mockCtx);
			expect(ChatOpenAI).not.toHaveBeenCalled();
		});

		it('uses LangchainAdapter when model has type other than "openai"', () => {
			const modelWithOtherType = {
				type: 'custom',
				provider: 'custom',
				modelId: 'custom-model',
				generate: jest.fn(),
				stream: jest.fn(),
				withTools: jest.fn().mockReturnThis(),
			};

			const result = supplyModel(mockCtx, modelWithOtherType);

			expect(result).toEqual({ response: mockLangchainAdapterInstance });
			expect(LangchainAdapter).toHaveBeenCalledWith(modelWithOtherType, mockCtx);
			expect(ChatOpenAI).not.toHaveBeenCalled();
		});

		it('uses LangchainAdapter when model has no type property', () => {
			const modelWithoutType = {
				provider: 'google',
				modelId: 'gemini-pro',
				generate: jest.fn(),
				stream: jest.fn(),
				withTools: jest.fn().mockReturnThis(),
			};

			const result = supplyModel(mockCtx, modelWithoutType);

			expect(result).toEqual({ response: mockLangchainAdapterInstance });
			expect(LangchainAdapter).toHaveBeenCalledWith(modelWithoutType, mockCtx);
			expect(ChatOpenAI).not.toHaveBeenCalled();
		});
	});
});
