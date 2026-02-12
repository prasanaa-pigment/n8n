import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { AuthProviderType } from '@n8n/db';
import { Service } from '@n8n/di';
import { randomUUID } from 'crypto';
import type * as openidClientTypes from 'openid-client';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { JwtService } from '@/services/jwt.service';

import type {
	SocialLoginAuthorizationResult,
	SocialLoginProvider,
	SocialLoginUserInfo,
} from '../social-login-provider.interface';

const GOOGLE_DISCOVERY_URL = new URL(
	'https://accounts.google.com/.well-known/openid-configuration',
);

@Service()
export class GoogleSocialLoginProvider implements SocialLoginProvider {
	readonly name = 'google';

	readonly providerType: AuthProviderType = 'google';

	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	private openidClient: typeof import('openid-client') | undefined;

	private cachedConfiguration:
		| {
				configuration: Promise<openidClientTypes.Configuration>;
				validTill: Date;
		  }
		| undefined;

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly jwtService: JwtService,
		private readonly logger: Logger,
	) {}

	private get config() {
		return this.globalConfig.sso.socialLogin.google;
	}

	isEnabled(): boolean {
		return this.config.enabled && this.config.clientId !== '' && this.config.clientSecret !== '';
	}

	async getAuthorizationUrl(callbackUrl: string): Promise<SocialLoginAuthorizationResult> {
		const openidClient = await this.loadOpenIdClient();
		const configuration = await this.getConfiguration();

		const state = this.generateState();

		const authorizationUrl = openidClient.buildAuthorizationUrl(configuration, {
			redirect_uri: callbackUrl,
			response_type: 'code',
			scope: 'openid email profile',
			prompt: 'select_account',
			state: state.plaintext,
			...(this.config.allowedDomain && { hd: this.config.allowedDomain }),
		});

		return {
			url: authorizationUrl.toString(),
			state: state.signed,
		};
	}

	async exchangeCodeForUser(callbackUrl: URL, storedState: string): Promise<SocialLoginUserInfo> {
		const openidClient = await this.loadOpenIdClient();
		const configuration = await this.getConfiguration();

		const expectedState = this.verifyState(storedState);

		let tokens;
		try {
			tokens = await openidClient.authorizationCodeGrant(configuration, callbackUrl, {
				expectedState,
			});
		} catch (error) {
			this.logger.error('Google social login: Failed to exchange authorization code', { error });
			throw new BadRequestError('Invalid authorization code');
		}

		let claims;
		try {
			claims = tokens.claims();
		} catch (error) {
			this.logger.error('Google social login: Failed to extract claims from tokens', { error });
			throw new BadRequestError('Invalid token');
		}

		if (!claims) {
			throw new BadRequestError('No claims found in the Google ID token');
		}

		const email = claims.email as string | undefined;
		if (!email) {
			throw new BadRequestError('Google account does not have an email address');
		}

		// Enforce domain restriction if configured
		if (this.config.allowedDomain) {
			const emailDomain = email.split('@')[1];
			if (emailDomain !== this.config.allowedDomain) {
				this.logger.warn('Google social login: Email domain not allowed', {
					email,
					allowedDomain: this.config.allowedDomain,
				});
				throw new BadRequestError(
					`Only accounts from @${this.config.allowedDomain} are allowed to sign in`,
				);
			}
		}

		return {
			providerId: claims.sub,
			email,
			firstName: (claims.given_name as string | undefined) ?? undefined,
			lastName: (claims.family_name as string | undefined) ?? undefined,
		};
	}

	private generateState(): { signed: string; plaintext: string } {
		const state = `n8n_social_state:${randomUUID()}`;
		return {
			signed: this.jwtService.sign({ state }, { expiresIn: '15m' }),
			plaintext: state,
		};
	}

	private verifyState(signedState: string): string {
		let state: string;
		try {
			const decoded = this.jwtService.verify(signedState);
			state = decoded?.state;
		} catch (error) {
			this.logger.error('Google social login: Failed to verify state', { error });
			throw new BadRequestError('Invalid state');
		}

		if (typeof state !== 'string' || !state.startsWith('n8n_social_state:')) {
			throw new BadRequestError('Invalid state');
		}

		return state;
	}

	private async loadOpenIdClient() {
		if (!this.openidClient) {
			this.openidClient = await import('openid-client');
		}
		return this.openidClient;
	}

	private async getConfiguration(): Promise<openidClientTypes.Configuration> {
		const now = Date.now();
		if (
			this.cachedConfiguration === undefined ||
			now >= this.cachedConfiguration.validTill.getTime()
		) {
			const openidClient = await this.loadOpenIdClient();
			this.cachedConfiguration = {
				configuration: openidClient.discovery(
					GOOGLE_DISCOVERY_URL,
					this.config.clientId,
					this.config.clientSecret,
				),
				validTill: new Date(now + 60 * 60 * 1000), // Cache for 1 hour
			};
		}
		return await this.cachedConfiguration.configuration;
	}
}
