import { GoogleSocialLoginConfigDto, GitHubSocialLoginConfigDto } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Time } from '@n8n/constants';
import { AuthenticatedRequest } from '@n8n/db';
import { Body, Get, GlobalScope, Post, RestController } from '@n8n/decorators';
import type { Response } from 'express';

import { AuthService } from '@/auth/auth.service';
import { SOCIAL_LOGIN_STATE_COOKIE_NAME } from '@/constants';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';
import type { AuthlessRequest } from '@/requests';

import { SocialLoginService } from './social-login.service';

type SocialLoginRequest = AuthlessRequest<{ provider: string }>;

@RestController('/sso/social')
export class SocialLoginController {
	constructor(
		private readonly socialLoginService: SocialLoginService,
		private readonly authService: AuthService,
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
	) {}

	// ── Admin config endpoints ─────────────────────────────────────

	@Get('/config')
	@GlobalScope('socialLogin:manage')
	async getConfig(_req: AuthenticatedRequest) {
		return await this.socialLoginService.getRedactedConfig();
	}

	@Post('/google/config')
	@GlobalScope('socialLogin:manage')
	async saveGoogleConfig(
		_req: AuthenticatedRequest,
		_res: Response,
		@Body payload: GoogleSocialLoginConfigDto,
	) {
		await this.socialLoginService.saveProviderConfig('google', payload);
		await this.socialLoginService.applyConfigToGlobalConfig();
		return await this.socialLoginService.getRedactedConfig();
	}

	@Post('/github/config')
	@GlobalScope('socialLogin:manage')
	async saveGitHubConfig(
		_req: AuthenticatedRequest,
		_res: Response,
		@Body payload: GitHubSocialLoginConfigDto,
	) {
		await this.socialLoginService.saveProviderConfig('github', payload);
		await this.socialLoginService.applyConfigToGlobalConfig();
		return await this.socialLoginService.getRedactedConfig();
	}

	// ── OAuth flow endpoints ───────────────────────────────────────

	@Get('/:provider/login', { skipAuth: true })
	async redirectToProvider(req: SocialLoginRequest, res: Response) {
		const providerName = req.params.provider;
		const provider = this.socialLoginService.getProvider(providerName);

		if (!provider || !provider.isEnabled()) {
			throw new NotFoundError(`Social login provider "${providerName}" is not available`);
		}

		const callbackUrl = this.socialLoginService.getCallbackUrl(providerName);
		const authorization = await provider.getAuthorizationUrl(callbackUrl);

		const { samesite, secure } = this.globalConfig.auth.cookie;

		const stateCookieName = `${SOCIAL_LOGIN_STATE_COOKIE_NAME}-${providerName}`;
		res.cookie(stateCookieName, authorization.state, {
			maxAge: 15 * Time.minutes.toMilliseconds,
			httpOnly: true,
			sameSite: samesite,
			secure,
		});

		res.redirect(authorization.url);
	}

	@Get('/:provider/callback', { skipAuth: true })
	async handleCallback(req: SocialLoginRequest, res: Response) {
		const providerName = req.params.provider;
		const provider = this.socialLoginService.getProvider(providerName);

		if (!provider || !provider.isEnabled()) {
			throw new NotFoundError(`Social login provider "${providerName}" is not available`);
		}

		const stateCookieName = `${SOCIAL_LOGIN_STATE_COOKIE_NAME}-${providerName}`;
		const storedState = req.cookies[stateCookieName] as string | undefined;

		if (typeof storedState !== 'string') {
			this.logger.error(`Social login (${providerName}): State cookie is missing`);
			throw new BadRequestError('Invalid state');
		}

		const callbackUrl = this.buildCallbackUrl(req);
		const userInfo = await provider.exchangeCodeForUser(callbackUrl, storedState);
		const user = await this.socialLoginService.resolveUser(provider, userInfo);

		res.clearCookie(stateCookieName);
		this.authService.issueCookie(res, user, true, req.browserId);

		this.logger.info(`Social login (${providerName}): User ${user.email} logged in`);

		res.redirect('/');
	}

	private buildCallbackUrl(req: SocialLoginRequest): URL {
		const baseUrl = this.socialLoginService.getCallbackUrl(req.params.provider);
		const url = new URL(baseUrl);
		// Append query params from the callback (code, state, etc.)
		for (const [key, value] of Object.entries(req.query)) {
			if (typeof value === 'string') {
				url.searchParams.set(key, value);
			}
		}
		return url;
	}
}
