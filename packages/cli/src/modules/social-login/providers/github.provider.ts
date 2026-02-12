import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { AuthProviderType } from '@n8n/db';
import { Service } from '@n8n/di';
import { randomUUID } from 'crypto';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { JwtService } from '@/services/jwt.service';

import type {
	SocialLoginAuthorizationResult,
	SocialLoginProvider,
	SocialLoginUserInfo,
} from '../social-login-provider.interface';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_USER_EMAILS_URL = 'https://api.github.com/user/emails';

interface GitHubTokenResponse {
	access_token: string;
	token_type: string;
	scope: string;
}

interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	email: string | null;
	avatar_url: string;
}

interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: string | null;
}

@Service()
export class GitHubSocialLoginProvider implements SocialLoginProvider {
	readonly name = 'github';

	readonly providerType: AuthProviderType = 'github';

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly jwtService: JwtService,
		private readonly logger: Logger,
	) {}

	private get config() {
		return this.globalConfig.sso.socialLogin.github;
	}

	isEnabled(): boolean {
		return this.config.enabled && this.config.clientId !== '' && this.config.clientSecret !== '';
	}

	async getAuthorizationUrl(callbackUrl: string): Promise<SocialLoginAuthorizationResult> {
		const state = this.generateState();

		const params = new URLSearchParams({
			client_id: this.config.clientId,
			redirect_uri: callbackUrl,
			scope: 'read:user user:email',
			state: state.plaintext,
		});

		return {
			url: `${GITHUB_AUTHORIZE_URL}?${params.toString()}`,
			state: state.signed,
		};
	}

	async exchangeCodeForUser(callbackUrl: URL, storedState: string): Promise<SocialLoginUserInfo> {
		const expectedState = this.verifyState(storedState);

		const code = callbackUrl.searchParams.get('code');
		const returnedState = callbackUrl.searchParams.get('state');

		if (!code) {
			throw new BadRequestError('Missing authorization code');
		}

		if (returnedState !== expectedState) {
			this.logger.error('GitHub social login: State mismatch', {
				expected: expectedState,
				received: returnedState,
			});
			throw new BadRequestError('Invalid state');
		}

		// Exchange code for access token
		const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify({
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				code,
			}),
		});

		if (!tokenResponse.ok) {
			this.logger.error('GitHub social login: Token exchange failed', {
				status: tokenResponse.status,
			});
			throw new BadRequestError('Failed to exchange authorization code');
		}

		const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

		if (!tokenData.access_token) {
			this.logger.error('GitHub social login: No access token in response');
			throw new BadRequestError('Failed to obtain access token');
		}

		// Fetch user profile
		const userResponse = await fetch(GITHUB_USER_URL, {
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`,
				Accept: 'application/json',
			},
		});

		if (!userResponse.ok) {
			this.logger.error('GitHub social login: Failed to fetch user profile', {
				status: userResponse.status,
			});
			throw new BadRequestError('Failed to fetch user profile');
		}

		const user = (await userResponse.json()) as GitHubUser;

		// Get email — may need a separate API call if email is private
		let email: string | undefined = user.email ?? undefined;

		if (!email) {
			email = await this.fetchPrimaryEmail(tokenData.access_token);
		}

		if (!email) {
			throw new BadRequestError(
				'Your GitHub account does not have a verified email address. Please add and verify an email in your GitHub settings.',
			);
		}

		// Split name into first/last if available
		const nameParts = user.name?.split(' ') ?? [];
		const firstName = nameParts[0] ?? user.login;
		const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

		return {
			providerId: String(user.id),
			email,
			firstName,
			lastName,
		};
	}

	private async fetchPrimaryEmail(accessToken: string): Promise<string | undefined> {
		try {
			const emailsResponse = await fetch(GITHUB_USER_EMAILS_URL, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/json',
				},
			});

			if (!emailsResponse.ok) {
				this.logger.warn('GitHub social login: Failed to fetch user emails', {
					status: emailsResponse.status,
				});
				return undefined;
			}

			const emails = (await emailsResponse.json()) as GitHubEmail[];

			// Prefer verified primary email
			const primary = emails.find((e) => e.primary && e.verified);
			if (primary) return primary.email;

			// Fall back to any verified email
			const verified = emails.find((e) => e.verified);
			if (verified) return verified.email;

			return undefined;
		} catch (error) {
			this.logger.warn('GitHub social login: Error fetching emails', { error });
			return undefined;
		}
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
			this.logger.error('GitHub social login: Failed to verify state', { error });
			throw new BadRequestError('Invalid state');
		}

		if (typeof state !== 'string' || !state.startsWith('n8n_social_state:')) {
			throw new BadRequestError('Invalid state');
		}

		return state;
	}
}
