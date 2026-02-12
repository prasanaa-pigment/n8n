import type { SocialLoginConfigResponse } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import {
	AuthIdentity,
	AuthIdentityRepository,
	GLOBAL_MEMBER_ROLE,
	isValidEmail,
	SettingsRepository,
	UserRepository,
	type User,
} from '@n8n/db';
import { Service } from '@n8n/di';
import { Cipher } from 'n8n-core';
import { jsonParse } from 'n8n-workflow';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { UrlService } from '@/services/url.service';

import type { SocialLoginProvider, SocialLoginUserInfo } from './social-login-provider.interface';

export const SOCIAL_LOGIN_PREFERENCES_DB_KEY = 'features.socialLogin';
const SOCIAL_LOGIN_SECRET_REDACTED = '**********';

/**
 * Core service for social login. Manages providers and handles
 * user resolution (find existing / create new) after OAuth callback.
 *
 * Config resolution: DB-stored config takes priority over env vars.
 * When the settings page saves config, it is stored in the `settings`
 * table and encrypted secrets use Cipher.
 */
@Service()
export class SocialLoginService {
	private readonly providers = new Map<string, SocialLoginProvider>();

	constructor(
		private readonly authIdentityRepository: AuthIdentityRepository,
		private readonly userRepository: UserRepository,
		private readonly settingsRepository: SettingsRepository,
		private readonly urlService: UrlService,
		private readonly globalConfig: GlobalConfig,
		private readonly cipher: Cipher,
		private readonly logger: Logger,
	) {}

	registerProvider(provider: SocialLoginProvider): void {
		this.providers.set(provider.name, provider);
		this.logger.debug(`Social login provider "${provider.name}" registered`);
	}

	getProvider(name: string): SocialLoginProvider | undefined {
		return this.providers.get(name);
	}

	getEnabledProviders(): SocialLoginProvider[] {
		return [...this.providers.values()].filter((p) => p.isEnabled());
	}

	getCallbackUrl(providerName: string): string {
		const restEndpoint = this.globalConfig.endpoints.rest;
		return `${this.urlService.getInstanceBaseUrl()}/${restEndpoint}/sso/social/${providerName}/callback`;
	}

	// ── Config persistence (DB > env) ──────────────────────────────

	/**
	 * Load the full social login config. DB values take priority; env
	 * vars are used as defaults when nothing is stored in the DB.
	 */
	async loadConfig(): Promise<SocialLoginConfigResponse> {
		const dbConfig = await this.loadConfigFromDb();

		const envGoogle = this.globalConfig.sso.socialLogin.google;
		const envGitHub = this.globalConfig.sso.socialLogin.github;

		return {
			google: {
				enabled: dbConfig?.google?.enabled ?? envGoogle.enabled,
				clientId: dbConfig?.google?.clientId ?? envGoogle.clientId,
				clientSecret: dbConfig?.google?.clientSecret ?? envGoogle.clientSecret,
				allowedDomain: dbConfig?.google?.allowedDomain ?? envGoogle.allowedDomain,
			},
			github: {
				enabled: dbConfig?.github?.enabled ?? envGitHub.enabled,
				clientId: dbConfig?.github?.clientId ?? envGitHub.clientId,
				clientSecret: dbConfig?.github?.clientSecret ?? envGitHub.clientSecret,
			},
		};
	}

	/**
	 * Returns the config with secrets redacted (safe for frontend).
	 */
	async getRedactedConfig(): Promise<SocialLoginConfigResponse> {
		const config = await this.loadConfig();
		return {
			google: {
				...config.google,
				clientSecret: config.google.clientSecret ? SOCIAL_LOGIN_SECRET_REDACTED : '',
			},
			github: {
				...config.github,
				clientSecret: config.github.clientSecret ? SOCIAL_LOGIN_SECRET_REDACTED : '',
			},
		};
	}

	/**
	 * Save a single provider's config to the DB.
	 * Secrets are encrypted before storage.
	 * The redacted placeholder is replaced with the current stored value.
	 */
	async saveProviderConfig(
		providerName: string,
		newConfig: Record<string, unknown>,
	): Promise<void> {
		const currentConfig = await this.loadConfig();
		const currentProviderConfig = (currentConfig as Record<string, Record<string, unknown>>)[
			providerName
		];

		// If the secret field is the redacted placeholder, keep the existing secret
		if (
			typeof newConfig.clientSecret === 'string' &&
			newConfig.clientSecret === SOCIAL_LOGIN_SECRET_REDACTED &&
			currentProviderConfig
		) {
			newConfig.clientSecret = currentProviderConfig.clientSecret as string;
		}

		// Build full config merging with current
		const mergedConfig = {
			...currentConfig,
			[providerName]: {
				...currentProviderConfig,
				...newConfig,
			},
		};

		// Encrypt secrets before storing
		const toStore = this.encryptSecrets(mergedConfig);

		await this.settingsRepository.save({
			key: SOCIAL_LOGIN_PREFERENCES_DB_KEY,
			value: JSON.stringify(toStore),
			loadOnStartup: true,
		});

		this.logger.info(`Social login config updated for provider: ${providerName}`);
	}

	/**
	 * Whether a given provider is enabled according to the resolved config.
	 */
	async isProviderEnabled(providerName: string): Promise<boolean> {
		const config = await this.loadConfig();
		const providerConfig = (config as Record<string, Record<string, unknown>>)[providerName];
		return (
			!!providerConfig &&
			providerConfig.enabled === true &&
			typeof providerConfig.clientId === 'string' &&
			providerConfig.clientId !== ''
		);
	}

	/**
	 * Returns the resolved config for a single provider (with decrypted secrets).
	 */
	async getProviderConfig(providerName: string): Promise<Record<string, unknown> | undefined> {
		const config = await this.loadConfig();
		return (config as Record<string, Record<string, unknown>>)[providerName];
	}

	/**
	 * After saving config to DB, apply the resolved values to the in-memory
	 * globalConfig so providers immediately see the updated credentials.
	 */
	async applyConfigToGlobalConfig(): Promise<void> {
		const config = await this.loadConfig();
		this.globalConfig.sso.socialLogin.google.enabled = config.google.enabled;
		this.globalConfig.sso.socialLogin.google.clientId = config.google.clientId;
		this.globalConfig.sso.socialLogin.google.clientSecret = config.google.clientSecret;
		this.globalConfig.sso.socialLogin.google.allowedDomain = config.google.allowedDomain;

		this.globalConfig.sso.socialLogin.github.enabled = config.github.enabled;
		this.globalConfig.sso.socialLogin.github.clientId = config.github.clientId;
		this.globalConfig.sso.socialLogin.github.clientSecret = config.github.clientSecret;
	}

	private async loadConfigFromDb(): Promise<SocialLoginConfigResponse | undefined> {
		const row = await this.settingsRepository.findByKey(SOCIAL_LOGIN_PREFERENCES_DB_KEY);
		if (!row) return undefined;

		try {
			const parsed = jsonParse<SocialLoginConfigResponse>(row.value);
			return this.decryptSecrets(parsed);
		} catch (error) {
			this.logger.warn('Failed to parse social login config from DB, ignoring', { error });
			return undefined;
		}
	}

	private encryptSecrets(config: SocialLoginConfigResponse): SocialLoginConfigResponse {
		return {
			google: {
				...config.google,
				clientSecret: config.google.clientSecret
					? this.cipher.encrypt(config.google.clientSecret)
					: '',
			},
			github: {
				...config.github,
				clientSecret: config.github.clientSecret
					? this.cipher.encrypt(config.github.clientSecret)
					: '',
			},
		};
	}

	private decryptSecrets(config: SocialLoginConfigResponse): SocialLoginConfigResponse {
		return {
			google: {
				...config.google,
				clientSecret: config.google.clientSecret
					? this.cipher.decrypt(config.google.clientSecret)
					: '',
			},
			github: {
				...config.github,
				clientSecret: config.github.clientSecret
					? this.cipher.decrypt(config.github.clientSecret)
					: '',
			},
		};
	}

	/**
	 * Resolves a social login user to an n8n User entity.
	 *
	 * 1. Check for existing AuthIdentity by providerId + providerType
	 * 2. If found → return existing user
	 * 3. If not → check for user by email
	 * 4. If email user exists → link identity to existing user
	 * 5. If no user → create new user + identity (JIT provisioning)
	 */
	async resolveUser(provider: SocialLoginProvider, userInfo: SocialLoginUserInfo): Promise<User> {
		if (!isValidEmail(userInfo.email)) {
			throw new BadRequestError('Invalid email format');
		}

		// Step 1: Check for existing identity
		const existingIdentity = await this.authIdentityRepository.findOne({
			where: { providerId: userInfo.providerId, providerType: provider.providerType },
			relations: { user: { role: true } },
		});

		if (existingIdentity) {
			if (existingIdentity.user.disabled) {
				throw new ForbiddenError('This account has been disabled');
			}
			this.logger.debug(
				`Social login (${provider.name}): Existing identity found for user ${existingIdentity.user.email}`,
			);
			return existingIdentity.user;
		}

		// Step 2: Check for existing user by email
		const existingUser = await this.userRepository.findOne({
			where: { email: userInfo.email },
			relations: ['authIdentities', 'role'],
		});

		if (existingUser) {
			if (existingUser.disabled) {
				throw new ForbiddenError('This account has been disabled');
			}
			this.logger.debug(
				`Social login (${provider.name}): Linking identity to existing user ${userInfo.email}`,
			);
			const identity = this.authIdentityRepository.create({
				providerId: userInfo.providerId,
				providerType: provider.providerType,
				userId: existingUser.id,
			});
			await this.authIdentityRepository.save(identity);
			return existingUser;
		}

		// Step 3: JIT provisioning - create new user
		if (!this.globalConfig.sso.justInTimeProvisioning) {
			throw new ForbiddenError('User does not exist and automatic account creation is disabled');
		}

		this.logger.debug(`Social login (${provider.name}): Creating new user for ${userInfo.email}`);

		return await this.userRepository.manager.transaction(async (trx) => {
			const { user } = await this.userRepository.createUserWithProject(
				{
					firstName: userInfo.firstName,
					lastName: userInfo.lastName,
					email: userInfo.email,
					authIdentities: [],
					role: GLOBAL_MEMBER_ROLE,
					password: 'no password set',
				},
				trx,
			);

			await trx.save(
				trx.create(AuthIdentity, {
					providerId: userInfo.providerId,
					providerType: provider.providerType,
					userId: user.id,
				}),
			);

			return user;
		});
	}
}
