import { Logger } from '@n8n/backend-common';
import type { ModuleInterface } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

/**
 * Social Login module — provides OAuth2-based social login (Google, GitHub, etc.)
 *
 * This module is NOT license-gated: social login is a community feature.
 * It uses a provider-based architecture for extensibility.
 * To add a new provider, implement `SocialLoginProvider` and register it
 * in `init()` below.
 */
@BackendModule({ name: 'social-login', instanceTypes: ['main'] })
export class SocialLoginModule implements ModuleInterface {
	async init() {
		await import('./social-login.controller');

		const { SocialLoginService } = await import('./social-login.service');
		const { GoogleSocialLoginProvider } = await import('./providers/google.provider');
		const { GitHubSocialLoginProvider } = await import('./providers/github.provider');

		const service = Container.get(SocialLoginService);

		// Register providers
		service.registerProvider(Container.get(GoogleSocialLoginProvider));
		service.registerProvider(Container.get(GitHubSocialLoginProvider));

		// Apply DB-stored config to globalConfig so providers see resolved values
		try {
			await service.applyConfigToGlobalConfig();
		} catch (error) {
			Container.get(Logger).warn('Failed to apply social login DB config at startup', { error });
		}

		const logger = Container.get(Logger);
		const enabledProviders = service.getEnabledProviders();

		if (enabledProviders.length > 0) {
			logger.info(`Social login enabled for: ${enabledProviders.map((p) => p.name).join(', ')}`);
		} else {
			logger.debug('Social login module loaded, but no providers are enabled');
		}
	}
}
