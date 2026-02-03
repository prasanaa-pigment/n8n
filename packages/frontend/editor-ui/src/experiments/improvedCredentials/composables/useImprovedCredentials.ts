import { storeToRefs } from 'pinia';
import { useImprovedCredentialsStore } from '../stores/improvedCredentials.store';

export function useImprovedCredentials() {
	const store = useImprovedCredentialsStore();
	const { isFeatureEnabled } = storeToRefs(store);

	return {
		isEnabled: isFeatureEnabled,
	};
}
