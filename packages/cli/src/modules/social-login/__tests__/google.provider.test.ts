import { mockLogger } from '@n8n/backend-test-utils';
import type { GlobalConfig } from '@n8n/config';
import { mock } from 'jest-mock-extended';
import type { JwtService } from '@/services/jwt.service';

import { GoogleSocialLoginProvider } from '../providers/google.provider';

describe('GoogleSocialLoginProvider', () => {
	let provider: GoogleSocialLoginProvider;
	let globalConfig: jest.Mocked<GlobalConfig>;
	let jwtService: jest.Mocked<JwtService>;

	beforeEach(() => {
		globalConfig = mock<GlobalConfig>({
			sso: {
				socialLogin: {
					google: {
						enabled: true,
						clientId: 'test-client-id',
						clientSecret: 'test-client-secret',
						allowedDomain: '',
					},
				},
			},
		});
		jwtService = mock<JwtService>();

		provider = new GoogleSocialLoginProvider(globalConfig, jwtService, mockLogger());
	});

	describe('name and providerType', () => {
		it('should have correct name', () => {
			expect(provider.name).toBe('google');
		});

		it('should have correct providerType', () => {
			expect(provider.providerType).toBe('google');
		});
	});

	describe('isEnabled', () => {
		it('should return true when enabled with valid config', () => {
			expect(provider.isEnabled()).toBe(true);
		});

		it('should return false when disabled', () => {
			globalConfig.sso.socialLogin.google.enabled = false;
			expect(provider.isEnabled()).toBe(false);
		});

		it('should return false when clientId is empty', () => {
			globalConfig.sso.socialLogin.google.clientId = '';
			expect(provider.isEnabled()).toBe(false);
		});

		it('should return false when clientSecret is empty', () => {
			globalConfig.sso.socialLogin.google.clientSecret = '';
			expect(provider.isEnabled()).toBe(false);
		});
	});

	describe('state management', () => {
		it('should reject invalid state during verification', async () => {
			jwtService.verify.mockImplementation(() => {
				throw new Error('Invalid token');
			});

			// Access the private verifyState method through exchangeCodeForUser
			// The state verification happens before the openid-client call
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
	});
});
