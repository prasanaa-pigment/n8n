import { mockLogger } from '@n8n/backend-test-utils';
import type { GlobalConfig } from '@n8n/config';
import type { AuthIdentityRepository, SettingsRepository, User, UserRepository } from '@n8n/db';
import { mock } from 'jest-mock-extended';
import type { Cipher } from 'n8n-core';
import type { UrlService } from '@/services/url.service';

import type { SocialLoginProvider, SocialLoginUserInfo } from '../social-login-provider.interface';
import { SocialLoginService } from '../social-login.service';

describe('SocialLoginService', () => {
	let service: SocialLoginService;
	let authIdentityRepository: jest.Mocked<AuthIdentityRepository>;
	let userRepository: jest.Mocked<UserRepository>;
	let settingsRepository: jest.Mocked<SettingsRepository>;
	let urlService: jest.Mocked<UrlService>;
	let globalConfig: jest.Mocked<GlobalConfig>;
	let cipher: jest.Mocked<Cipher>;

	const mockProvider: SocialLoginProvider = {
		name: 'google',
		providerType: 'google',
		isEnabled: () => true,
		getAuthorizationUrl: jest.fn(),
		exchangeCodeForUser: jest.fn(),
	};

	const mockUserInfo: SocialLoginUserInfo = {
		providerId: 'google-123',
		email: 'test@example.com',
		firstName: 'Test',
		lastName: 'User',
	};

	beforeEach(() => {
		authIdentityRepository = mock<AuthIdentityRepository>();
		userRepository = mock<UserRepository>();
		settingsRepository = mock<SettingsRepository>();
		urlService = mock<UrlService>();
		cipher = mock<Cipher>();
		globalConfig = mock<GlobalConfig>({
			endpoints: { rest: 'api' },
			sso: {
				justInTimeProvisioning: true,
				socialLogin: {
					google: { enabled: false, clientId: '', clientSecret: '', allowedDomain: '' },
					github: { enabled: false, clientId: '', clientSecret: '' },
				},
			},
		});

		service = new SocialLoginService(
			authIdentityRepository,
			userRepository,
			settingsRepository,
			urlService,
			globalConfig,
			cipher,
			mockLogger(),
		);
	});

	describe('registerProvider', () => {
		it('should register a provider', () => {
			service.registerProvider(mockProvider);

			expect(service.getProvider('google')).toBe(mockProvider);
		});

		it('should return undefined for unregistered provider', () => {
			expect(service.getProvider('github')).toBeUndefined();
		});
	});

	describe('getEnabledProviders', () => {
		it('should return only enabled providers', () => {
			const disabledProvider: SocialLoginProvider = {
				...mockProvider,
				name: 'disabled',
				isEnabled: () => false,
			};

			service.registerProvider(mockProvider);
			service.registerProvider(disabledProvider);

			const enabled = service.getEnabledProviders();
			expect(enabled).toHaveLength(1);
			expect(enabled[0].name).toBe('google');
		});
	});

	describe('getCallbackUrl', () => {
		it('should return the correct callback URL', () => {
			urlService.getInstanceBaseUrl.mockReturnValue('http://localhost:5678');
			const url = service.getCallbackUrl('google');
			expect(url).toBe('http://localhost:5678/api/sso/social/google/callback');
		});
	});

	describe('resolveUser', () => {
		it('should return existing user when identity is found', async () => {
			const existingUser = mock<User>({ email: 'test@example.com', disabled: false });

			authIdentityRepository.findOne.mockResolvedValue({
				providerId: 'google-123',
				providerType: 'google',
				userId: 'user-1',
				user: existingUser,
			} as never);

			const user = await service.resolveUser(mockProvider, mockUserInfo);

			expect(user).toBe(existingUser);
			expect(authIdentityRepository.findOne).toHaveBeenCalledWith({
				where: { providerId: 'google-123', providerType: 'google' },
				relations: { user: { role: true } },
			});
		});

		it('should link identity to existing user found by email', async () => {
			const existingUser = mock<User>({ email: 'test@example.com', disabled: false });

			authIdentityRepository.findOne.mockResolvedValue(null);
			userRepository.findOne.mockResolvedValue(existingUser);
			authIdentityRepository.create.mockReturnValue({
				providerId: 'google-123',
				providerType: 'google',
				userId: existingUser.id,
			} as never);

			const user = await service.resolveUser(mockProvider, mockUserInfo);

			expect(user).toBe(existingUser);
			expect(authIdentityRepository.save).toHaveBeenCalled();
		});

		it('should create new user via JIT provisioning when no user exists', async () => {
			const newUser = mock<User>({ email: 'test@example.com' });

			authIdentityRepository.findOne.mockResolvedValue(null);
			userRepository.findOne.mockResolvedValue(null);

			const mockTrx = {
				save: jest.fn(),
				create: jest.fn().mockReturnValue({}),
			};
			userRepository.createUserWithProject.mockResolvedValue({ user: newUser } as never);
			userRepository.manager = {
				transaction: jest.fn().mockImplementation(async (cb) => cb(mockTrx)),
			} as never;

			const user = await service.resolveUser(mockProvider, mockUserInfo);

			expect(user).toBe(newUser);
		});

		it('should reject disabled users with existing identity', async () => {
			const disabledUser = mock<User>({ email: 'test@example.com', disabled: true });

			authIdentityRepository.findOne.mockResolvedValue({
				providerId: 'google-123',
				providerType: 'google',
				userId: 'user-1',
				user: disabledUser,
			} as never);

			await expect(service.resolveUser(mockProvider, mockUserInfo)).rejects.toThrow(
				'This account has been disabled',
			);
		});

		it('should reject disabled users found by email', async () => {
			const disabledUser = mock<User>({ email: 'test@example.com', disabled: true });

			authIdentityRepository.findOne.mockResolvedValue(null);
			userRepository.findOne.mockResolvedValue(disabledUser);

			await expect(service.resolveUser(mockProvider, mockUserInfo)).rejects.toThrow(
				'This account has been disabled',
			);
		});

		it('should reject when JIT provisioning is disabled and user does not exist', async () => {
			globalConfig.sso.justInTimeProvisioning = false;

			authIdentityRepository.findOne.mockResolvedValue(null);
			userRepository.findOne.mockResolvedValue(null);

			await expect(service.resolveUser(mockProvider, mockUserInfo)).rejects.toThrow(
				'automatic account creation is disabled',
			);
		});

		it('should reject invalid email', async () => {
			const invalidUserInfo = { ...mockUserInfo, email: 'not-an-email' };

			await expect(service.resolveUser(mockProvider, invalidUserInfo)).rejects.toThrow(
				'Invalid email format',
			);
		});
	});
});
