import { Config, Env, Nested } from '../decorators';

@Config
class SamlConfig {
	/** Whether to enable SAML SSO. */
	@Env('N8N_SSO_SAML_LOGIN_ENABLED')
	loginEnabled: boolean = false;

	@Env('N8N_SSO_SAML_LOGIN_LABEL')
	loginLabel: string = '';
}

@Config
class OidcConfig {
	/** Whether to enable OIDC SSO. */
	@Env('N8N_SSO_OIDC_LOGIN_ENABLED')
	loginEnabled: boolean = false;
}

@Config
class LdapConfig {
	/** Whether to enable LDAP SSO. */
	@Env('N8N_SSO_LDAP_LOGIN_ENABLED')
	loginEnabled: boolean = false;

	@Env('N8N_SSO_LDAP_LOGIN_LABEL')
	loginLabel: string = '';
}

@Config
class GoogleSocialLoginConfig {
	/** Whether to enable Google social login. */
	@Env('N8N_SSO_SOCIAL_LOGIN_GOOGLE_ENABLED')
	enabled: boolean = false;

	/** Google OAuth2 Client ID. */
	@Env('N8N_SSO_SOCIAL_LOGIN_GOOGLE_CLIENT_ID')
	clientId: string = '';

	/** Google OAuth2 Client Secret. */
	@Env('N8N_SSO_SOCIAL_LOGIN_GOOGLE_CLIENT_SECRET')
	clientSecret: string = '';

	/** Optional: Restrict login to a specific email domain (e.g. 'mycompany.com'). */
	@Env('N8N_SSO_SOCIAL_LOGIN_GOOGLE_ALLOWED_DOMAIN')
	allowedDomain: string = '';
}

@Config
class GitHubSocialLoginConfig {
	/** Whether to enable GitHub social login. */
	@Env('N8N_SSO_SOCIAL_LOGIN_GITHUB_ENABLED')
	enabled: boolean = false;

	/** GitHub OAuth App Client ID. */
	@Env('N8N_SSO_SOCIAL_LOGIN_GITHUB_CLIENT_ID')
	clientId: string = '';

	/** GitHub OAuth App Client Secret. */
	@Env('N8N_SSO_SOCIAL_LOGIN_GITHUB_CLIENT_SECRET')
	clientSecret: string = '';
}

@Config
class SocialLoginConfig {
	@Nested
	google: GoogleSocialLoginConfig;

	@Nested
	github: GitHubSocialLoginConfig;
}

@Config
class ProvisioningConfig {
	/** Whether to provision the instance role from an SSO auth claim */
	@Env('N8N_SSO_SCOPES_PROVISION_INSTANCE_ROLE')
	scopesProvisionInstanceRole: boolean = false;

	/** Whether to provision the project <> role mappings from an SSO auth claim */
	@Env('N8N_SSO_SCOPES_PROVISION_PROJECT_ROLES')
	scopesProvisionProjectRoles: boolean = false;

	/** The name of scope to request on oauth flows */
	@Env('N8N_SSO_SCOPES_NAME')
	scopesName: string = 'n8n';

	/** The name of the expected claim to be returned for provisioning instance role */
	@Env('N8N_SSO_SCOPES_INSTANCE_ROLE_CLAIM_NAME')
	scopesInstanceRoleClaimName: string = 'n8n_instance_role';

	/** The name of the expected claim to be returned for provisioning project <> role mappings */
	@Env('N8N_SSO_SCOPES_PROJECTS_ROLES_CLAIM_NAME')
	scopesProjectsRolesClaimName: string = 'n8n_projects';
}

@Config
export class SsoConfig {
	/** Whether to create users when they log in via SSO. */
	@Env('N8N_SSO_JUST_IN_TIME_PROVISIONING')
	justInTimeProvisioning: boolean = true;

	/** Whether to redirect users from the login dialog to initialize SSO flow. */
	@Env('N8N_SSO_REDIRECT_LOGIN_TO_SSO')
	redirectLoginToSso: boolean = true;

	@Nested
	saml: SamlConfig;

	@Nested
	oidc: OidcConfig;

	@Nested
	ldap: LdapConfig;

	@Nested
	provisioning: ProvisioningConfig;

	@Nested
	socialLogin: SocialLoginConfig;
}
