import type { IDataObject } from 'n8n-workflow';
import type { SecretsProviderConnection, SecretsProviderConnectionRepository } from '@n8n/db';
import { mock } from 'jest-mock-extended';

import { CREDENTIAL_BLANKING_VALUE } from '@/constants';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import type { ExternalSecretsManager } from '@/modules/external-secrets.ee/external-secrets-manager.ee';
import type { RedactionService } from '@/modules/external-secrets.ee/redaction.service.ee';
import { SecretsProvidersConnectionsService } from '@/modules/external-secrets.ee/secrets-providers-connections.service.ee';
import type { SecretsProvider } from '@/modules/external-secrets.ee/types';

describe('SecretsProvidersConnectionsService', () => {
	const mockExternalSecretsManager = mock<ExternalSecretsManager>();
	const mockRedactionService = mock<RedactionService>();
	const mockRepository = mock<SecretsProviderConnectionRepository>();
	const mockCipher = {
		encrypt: jest.fn((data: IDataObject) => JSON.stringify(data)),
		decrypt: jest.fn((data: string) => data),
	};

	const service = new SecretsProvidersConnectionsService(
		mockRepository,
		mock(),
		mockCipher as any,
		mockExternalSecretsManager,
		mockRedactionService,
	);

	beforeEach(() => {
		jest.clearAllMocks();
		mockCipher.decrypt.mockImplementation((data: string) => data);
	});

	describe('toPublicConnection', () => {
		it('should map entity to DTO with projects and redacted settings', () => {
			const decryptedSettings = { apiKey: 'secret123', region: 'us-east-1' };
			const redactedSettings = { apiKey: CREDENTIAL_BLANKING_VALUE, region: 'us-east-1' };
			const mockProvider = {
				properties: [
					{
						name: 'apiKey',
						type: 'string',
						displayName: 'API Key',
						default: '',
						typeOptions: { password: true },
					},
				],
			} as SecretsProvider;

			const connection = {
				id: 1,
				providerKey: 'my-aws',
				type: 'awsSecretsManager',
				encryptedSettings: JSON.stringify(decryptedSettings),
				projectAccess: [
					{ project: { id: 'p1', name: 'Project 1' } },
					{ project: { id: 'p2', name: 'Project 2' } },
				],
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-02'),
			} as unknown as SecretsProviderConnection;

			mockExternalSecretsManager.getProviderWithSettings.mockReturnValue({
				provider: mockProvider,
				settings: {} as any,
			});
			mockRedactionService.redact.mockReturnValue(redactedSettings);

			expect(service.toPublicConnection(connection)).toEqual({
				id: '1',
				name: 'my-aws',
				type: 'awsSecretsManager',
				projects: [
					{ id: 'p1', name: 'Project 1' },
					{ id: 'p2', name: 'Project 2' },
				],
				settings: redactedSettings,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
			});

			expect(mockExternalSecretsManager.getProviderWithSettings).toHaveBeenCalledWith(
				'awsSecretsManager',
			);
			expect(mockRedactionService.redact).toHaveBeenCalledWith(
				decryptedSettings,
				mockProvider.properties,
			);
		});

		it('should map entity to DTO without projects', () => {
			const decryptedSettings = { token: 'secret-token' };
			const redactedSettings = { token: CREDENTIAL_BLANKING_VALUE };
			const mockProvider = {
				properties: [
					{
						name: 'token',
						type: 'string',
						displayName: 'Token',
						default: '',
						typeOptions: { password: true },
					},
				],
			} as SecretsProvider;

			const connection = {
				id: 2,
				providerKey: 'my-vault',
				type: 'vault',
				encryptedSettings: JSON.stringify(decryptedSettings),
				projectAccess: [],
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-02'),
			} as unknown as SecretsProviderConnection;

			mockExternalSecretsManager.getProviderWithSettings.mockReturnValue({
				provider: mockProvider,
				settings: {} as any,
			});
			mockRedactionService.redact.mockReturnValue(redactedSettings);

			expect(service.toPublicConnection(connection)).toEqual({
				id: '2',
				name: 'my-vault',
				type: 'vault',
				projects: [],
				settings: redactedSettings,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
			});
		});
	});

	describe('toPublicConnectionListItem', () => {
		it('should map entity to lightweight DTO without settings', () => {
			const connection = {
				id: 1,
				providerKey: 'my-aws',
				type: 'awsSecretsManager',
				encryptedSettings: '{"apiKey":"secret"}',
				projectAccess: [
					{ project: { id: 'p1', name: 'Project 1' } },
					{ project: { id: 'p2', name: 'Project 2' } },
				],
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-02'),
			} as unknown as SecretsProviderConnection;

			const result = service.toPublicConnectionListItem(connection);

			expect(result).toEqual({
				id: '1',
				name: 'my-aws',
				type: 'awsSecretsManager',
				projects: [
					{ id: 'p1', name: 'Project 1' },
					{ id: 'p2', name: 'Project 2' },
				],
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
			});

			// Verify settings are NOT included in list response
			expect(result).not.toHaveProperty('settings');

			// Verify no external services were called (no decryption/redaction needed)
			expect(mockExternalSecretsManager.getProviderWithSettings).not.toHaveBeenCalled();
			expect(mockRedactionService.redact).not.toHaveBeenCalled();
		});
	});

	describe('toSecretCompletionsResponse', () => {
		it('should map connections to completions keyed by providerKey', () => {
			mockExternalSecretsManager.getSecretNames.mockImplementation((providerKey) => {
				if (providerKey === 'aws') return ['secret-a', 'secret-b'];
				if (providerKey === 'vault') return ['secret-c'];
				return [];
			});

			const connections = [
				{ providerKey: 'aws' },
				{ providerKey: 'vault' },
				{ providerKey: 'missing_from_cache' },
			] as unknown as SecretsProviderConnection[];

			expect(service.toSecretCompletionsResponse(connections)).toEqual({
				aws: ['secret-a', 'secret-b'],
				vault: ['secret-c'],
				missing_from_cache: [],
			});
		});

		it('should return empty object for empty connections', () => {
			expect(service.toSecretCompletionsResponse([])).toEqual({});
		});
	});

	describe('getConnectionForProject', () => {
		it('should return connection when it belongs to the given project', async () => {
			const connection = {
				id: 1,
				providerKey: 'my-aws',
				projectAccess: [{ projectId: 'project-1' }, { projectId: 'project-2' }],
			} as unknown as SecretsProviderConnection;

			mockRepository.findOne.mockResolvedValue(connection);

			const result = await service.getConnectionForProject('my-aws', 'project-1');
			expect(result).toBe(connection);
			expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { providerKey: 'my-aws' } });
		});

		it('should throw NotFoundError when connection does not exist', async () => {
			mockRepository.findOne.mockResolvedValue(null);

			await expect(service.getConnectionForProject('missing', 'project-1')).rejects.toThrow(
				NotFoundError,
			);
		});

		it('should throw NotFoundError when connection does not belong to the project', async () => {
			const connection = {
				id: 1,
				providerKey: 'my-aws',
				projectAccess: [{ projectId: 'other-project' }],
			} as unknown as SecretsProviderConnection;

			mockRepository.findOne.mockResolvedValue(connection);

			await expect(service.getConnectionForProject('my-aws', 'project-1')).rejects.toThrow(
				NotFoundError,
			);
		});

		it('should throw NotFoundError when connection has no project access entries', async () => {
			const connection = {
				id: 1,
				providerKey: 'global-conn',
				projectAccess: [],
			} as unknown as SecretsProviderConnection;

			mockRepository.findOne.mockResolvedValue(connection);

			await expect(service.getConnectionForProject('global-conn', 'project-1')).rejects.toThrow(
				NotFoundError,
			);
		});
	});
});
