import { mockLogger } from '@n8n/backend-test-utils';
import type { GlobalConfig } from '@n8n/config';
import { mock } from 'jest-mock-extended';
import type { JwtService } from '@/services/jwt.service';

import { GitHubSocialLoginProvider } from '../providers/github.provider';

describe('GitHubSocialLoginProvider', () => {
	let provider: GitHubSocialLoginProvider;
	let globalConfig: jest.Mocked<GlobalConfig>;
	let jwtService: jest.Mocked<JwtService>;

	beforeEach(() => {
		globalConfig = mock<GlobalConfig>({
			sso: {
				socialLogin: {
					github: {
						enabled: true,
						clientId: 'test-client-id',
						clientSecret: 'test-client-secret',
					},
				},
			},
		});
		jwtService = mock<JwtService>();

		provider = new GitHubSocialLoginProvider(globalConfig, jwtService, mockLogger());
	});

	describe('name and providerType', () => {
		it('should have correct name', () => {
			expect(provider.name).toBe('github');
		});

		it('should have correct providerType', () => {
			expect(provider.providerType).toBe('github');
		});
	});

	describe('isEnabled', () => {
		it('should return true when enabled with valid config', () => {
			expect(provider.isEnabled()).toBe(true);
		});

		it('should return false when disabled', () => {
			globalConfig.sso.socialLogin.github.enabled = false;
			expect(provider.isEnabled()).toBe(false);
		});

		it('should return false when clientId is empty', () => {
			globalConfig.sso.socialLogin.github.clientId = '';
			expect(provider.isEnabled()).toBe(false);
		});

		it('should return false when clientSecret is empty', () => {
			globalConfig.sso.socialLogin.github.clientSecret = '';
			expect(provider.isEnabled()).toBe(false);
		});
	});

	describe('getAuthorizationUrl', () => {
		it('should generate correct authorization URL', async () => {
			jwtService.sign.mockReturnValue('signed-state-token');

			const result = await provider.getAuthorizationUrl(
				'http://localhost:5678/rest/sso/social/github/callback',
			);

			expect(result.url).toContain('https://github.com/login/oauth/authorize');
			expect(result.url).toContain('client_id=test-client-id');
			expect(result.url).toContain(
				'redirect_uri=http%3A%2F%2Flocalhost%3A5678%2Frest%2Fsso%2Fsocial%2Fgithub%2Fcallback',
			);
			expect(result.url).toContain('scope=read%3Auser+user%3Aemail');
			expect(result.state).toBe('signed-state-token');
		});
	});

	describe('state management', () => {
		it('should reject invalid state during verification', async () => {
			jwtService.verify.mockImplementation(() => {
				throw new Error('Invalid token');
			});

			await expect(
				provider.exchangeCodeForUser(new URL('http://localhost/callback?code=abc'), 'bad-state'),
			).rejects.toThrow();
		});

		it('should reject state with wrong prefix', async () => {
			jwtService.verify.mockReturnValue({ state: 'wrong_prefix:123' });

			await expect(
				provider.exchangeCodeForUser(new URL('http://localhost/callback?code=abc'), 'signed-state'),
			).rejects.toThrow();
		});

		it('should reject when authorization code is missing', async () => {
			jwtService.verify.mockReturnValue({ state: 'n8n_social_state:uuid-123' });

			await expect(
				provider.exchangeCodeForUser(new URL('http://localhost/callback'), 'signed-state'),
			).rejects.toThrow('Missing authorization code');
		});
	});
});
