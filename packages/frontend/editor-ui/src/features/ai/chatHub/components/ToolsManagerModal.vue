<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
import Modal from '@/app/components/Modal.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import ToolListItem from './ToolListItem.vue';
import ToolSettingsContent from './ToolSettingsContent.vue';
import {
	N8nButton,
	N8nHeading,
	N8nIcon,
	N8nIconButton,
	N8nInlineTextEdit,
	N8nInput,
	N8nText,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { createEventBus } from '@n8n/utils/event-bus';
import { useDebounceFn } from '@vueuse/core';
import { NodeConnectionTypes, type INode, type INodeTypeDescription } from 'n8n-workflow';
import {
	ALWAYS_BLOCKED_CHAT_HUB_TOOL_TYPES,
	CHAT_USER_BLOCKED_CHAT_HUB_TOOL_TYPES,
} from '@n8n/api-types';
import type { ChatHubToolDto } from '@n8n/api-types';
import { computed, ref, watch } from 'vue';
import { DEBOUNCE_TIME, getDebounceTime, MODAL_CONFIRM } from '@/app/constants';
import { useChatStore } from '@/features/ai/chatHub/chat.store';
import { useToast } from '@/app/composables/useToast';
import { useMessage } from '@/app/composables/useMessage';
import { hasRole } from '@/app/utils/rbac/checks/hasRole';

defineProps<{
	modalName: string;
	data: {
		tools: INode[];
		onConfirm: (tools: INode[]) => void;
	};
}>();

function hasInputs(nodeType: INodeTypeDescription): boolean {
	const { inputs } = nodeType;
	if (Array.isArray(inputs)) {
		return inputs.length > 0;
	}

	// Expression-based inputs are always considered non-empty
	return true;
}

const i18n = useI18n();
const nodeTypesStore = useNodeTypesStore();
const chatStore = useChatStore();
const toast = useToast();
const message = useMessage();

const modalBus = ref(createEventBus());
const searchQuery = ref('');
const debouncedSearchQuery = ref('');

const setDebouncedSearchQuery = useDebounceFn((value: string) => {
	debouncedSearchQuery.value = value;
}, getDebounceTime(DEBOUNCE_TIME.INPUT.SEARCH));

watch(searchQuery, (newValue) => {
	void setDebouncedSearchQuery(newValue);
});

// View switching state
type ManagerView = 'list' | 'settings';
const currentView = ref<ManagerView>('list');
const settingsNode = ref<INode | null>(null);
const settingsExistingToolNames = ref<string[]>([]);
const settingsOnConfirm = ref<((node: INode) => void) | null>(null);
const settingsContentRef = ref<InstanceType<typeof ToolSettingsContent> | null>(null);
const settingsNodeName = ref('');
const settingsIsValid = ref(false);

const tools = computed<ChatHubToolDto[]>(() => chatStore.configuredTools);

const excludedToolTypes = computed(() => {
	const blocked = [...ALWAYS_BLOCKED_CHAT_HUB_TOOL_TYPES];
	if (hasRole(['global:chatUser'])) {
		blocked.push(...CHAT_USER_BLOCKED_CHAT_HUB_TOOL_TYPES);
	}
	return blocked;
});

const availableToolTypes = computed<INodeTypeDescription[]>(() => {
	const toolTypeNames =
		nodeTypesStore.visibleNodeTypesByOutputConnectionTypeNames[NodeConnectionTypes.AiTool] ?? [];

	return toolTypeNames
		.map((name) => nodeTypesStore.getNodeType(name))
		.filter(
			(nodeType): nodeType is INodeTypeDescription =>
				nodeType !== null &&
				!excludedToolTypes.value.includes(nodeType.name) &&
				!hasInputs(nodeType),
		);
});

const filteredConfiguredTools = computed(() => {
	if (!debouncedSearchQuery.value) {
		return tools.value;
	}
	const query = debouncedSearchQuery.value.toLowerCase();
	return tools.value.filter((tool) => {
		const def = tool.definition;
		const nodeType = nodeTypesStore.getNodeType(def.type, def.typeVersion);
		const nameMatch = def.name.toLowerCase().includes(query);
		const typeMatch = nodeType?.displayName.toLowerCase().includes(query);
		return nameMatch || typeMatch;
	});
});

const filteredAvailableTools = computed(() => {
	if (!debouncedSearchQuery.value) {
		return availableToolTypes.value;
	}
	const query = debouncedSearchQuery.value.toLowerCase();
	return availableToolTypes.value.filter((nodeType) => {
		const nameMatch = nodeType.displayName.toLowerCase().includes(query);
		const descMatch = nodeType.description?.toLowerCase().includes(query);
		return nameMatch || descMatch;
	});
});

function getNodeType(tool: ChatHubToolDto): INodeTypeDescription | null {
	return nodeTypesStore.getNodeType(tool.definition.type, tool.definition.typeVersion);
}

function openSettings(
	node: INode,
	existingNames: string[],
	onConfirm: (configuredNode: INode) => void,
) {
	settingsNode.value = node;
	settingsExistingToolNames.value = existingNames;
	settingsOnConfirm.value = onConfirm;
	settingsNodeName.value = node.name;
	settingsIsValid.value = false;
	currentView.value = 'settings';
}

function handleConfigureTool(tool: ChatHubToolDto) {
	const otherToolNames = tools.value
		.filter((t) => t.definition.id !== tool.definition.id)
		.map((t) => t.definition.name);

	openSettings({ ...tool.definition }, otherToolNames, async (configuredNode: INode) => {
		try {
			await chatStore.updateConfiguredTool(tool.definition.id, configuredNode);
		} catch (error) {
			toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
		}
	});
}

async function handleRemoveTool(toolId: string) {
	const confirmed = await message.confirm(
		i18n.baseText('chatHub.toolsManager.confirmRemove.message'),
		i18n.baseText('chatHub.toolsManager.confirmRemove.title'),
		{
			confirmButtonText: i18n.baseText('chatHub.toolsManager.remove'),
			cancelButtonText: i18n.baseText('generic.cancel'),
		},
	);
	if (confirmed !== MODAL_CONFIRM) return;

	try {
		await chatStore.removeConfiguredTool(toolId);
	} catch (error) {
		toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
	}
}

async function handleToggleTool(tool: ChatHubToolDto, enabled: boolean) {
	try {
		await chatStore.toggleToolEnabled(tool.definition.id, enabled);
	} catch (error) {
		toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
	}
}

function handleAddTool(nodeType: INodeTypeDescription) {
	const typeVersion =
		typeof nodeType.version === 'number'
			? nodeType.version
			: nodeType.version.toSorted((a, b) => b - a)?.[0];

	if (!typeVersion) {
		return;
	}

	const newToolId = uuidv4();
	const existingNames = tools.value.map((t) => t.definition.name);

	openSettings(
		{
			type: nodeType.name,
			typeVersion,
			parameters: {},
			id: newToolId,
			name: nodeType.displayName,
			position: [0, 0],
		},
		existingNames,
		async (configuredNode: INode) => {
			try {
				await chatStore.addConfiguredTool(configuredNode);
			} catch (error) {
				toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
			}
		},
	);
}

function handleBack() {
	currentView.value = 'list';
	settingsNode.value = null;
	settingsExistingToolNames.value = [];
	settingsOnConfirm.value = null;
	settingsNodeName.value = '';
	settingsIsValid.value = false;
}

function handleSave() {
	const currentNode = settingsContentRef.value?.node;
	if (!currentNode || !settingsOnConfirm.value) return;

	settingsOnConfirm.value(currentNode);
	handleBack();
}

function handleSettingsChangeName(name: string) {
	settingsContentRef.value?.handleChangeName(name);
}
</script>

<template>
	<Modal
		:name="modalName"
		:event-bus="modalBus"
		:center="true"
		width="710px"
		max-width="90vw"
		max-height="80vh"
		:scrollable="currentView === 'list'"
		:show-close="currentView === 'list'"
		:class="[$style.modal, currentView === 'settings' && $style.settingsView]"
	>
		<template #header>
			<!-- List view header -->
			<N8nHeading v-if="currentView === 'list'" tag="h2" size="large">
				{{ i18n.baseText('chatHub.toolsManager.title') }}
			</N8nHeading>

			<!-- Settings view header -->
			<div v-else :class="$style.settingsHeader">
				<div :class="$style.settingsHeaderLeft">
					<N8nIconButton
						icon="arrow-left"
						text
						size="large"
						type="secondary"
						:class="$style.backButton"
						@click="handleBack"
					/>
					<N8nInlineTextEdit
						:model-value="settingsNodeName"
						:max-width="350"
						:class="$style.title"
						@update:model-value="handleSettingsChangeName"
					/>
				</div>
				<N8nButton type="primary" size="small" :disabled="!settingsIsValid" @click="handleSave">
					{{ i18n.baseText('chatHub.toolSettings.confirm') }}
				</N8nButton>
			</div>
		</template>

		<template #content>
			<!-- List view (v-show to preserve scroll/search state) -->
			<div v-show="currentView === 'list'" :class="$style.content">
				<N8nInput
					v-model="searchQuery"
					:placeholder="i18n.baseText('chatHub.toolsManager.searchPlaceholder')"
					clearable
					:class="$style.searchInput"
				>
					<template #prefix>
						<N8nIcon icon="search" />
					</template>
				</N8nInput>

				<div v-if="filteredConfiguredTools.length > 0" :class="$style.section">
					<N8nHeading size="small" color="text-light" tag="h3">
						{{
							i18n.baseText('chatHub.toolsManager.configuredTools', {
								interpolate: { count: tools.length },
							})
						}}
					</N8nHeading>
					<div :class="$style.toolsList">
						<ToolListItem
							v-for="tool in filteredConfiguredTools"
							:key="tool.definition.id"
							:node-type="getNodeType(tool)!"
							:configured-node="tool.definition"
							:enabled="tool.enabled"
							mode="configured"
							@configure="handleConfigureTool(tool)"
							@remove="handleRemoveTool(tool.definition.id)"
							@toggle="handleToggleTool(tool, $event)"
						/>
					</div>
				</div>

				<div v-if="filteredAvailableTools.length > 0" :class="$style.section">
					<N8nHeading size="small" color="text-light" tag="h3">
						{{
							i18n.baseText('chatHub.toolsManager.availableTools', {
								interpolate: { count: availableToolTypes.length },
							})
						}}
					</N8nHeading>
					<div :class="$style.toolsList">
						<ToolListItem
							v-for="nodeType in filteredAvailableTools"
							:key="nodeType.name"
							:node-type="nodeType"
							mode="available"
							@add="handleAddTool(nodeType)"
						/>
					</div>
				</div>

				<div
					v-if="filteredConfiguredTools.length === 0 && filteredAvailableTools.length === 0"
					:class="$style.emptyState"
				>
					<N8nText color="text-light">
						{{ i18n.baseText('chatHub.toolsManager.noResults') }}
					</N8nText>
				</div>
			</div>

			<!-- Settings view (v-if for fresh mount/unmount lifecycle) -->
			<ToolSettingsContent
				v-if="currentView === 'settings' && settingsNode"
				ref="settingsContentRef"
				:initial-node="settingsNode"
				:existing-tool-names="settingsExistingToolNames"
				@update:valid="settingsIsValid = $event"
				@update:node-name="settingsNodeName = $event"
			/>
		</template>
	</Modal>
</template>

<style lang="scss" module>
.modal {
	:global(.el-dialog__body) {
		padding: var(--spacing--sm) 0 var(--spacing--sm) var(--spacing--md);
	}

	:global(.el-dialog__header) {
		padding: var(--spacing--md) var(--spacing--md) var(--spacing--sm);
	}
}

.settingsView {
	:global(.ndv-connection-hint-notice) {
		display: none;
	}

	:global(.modal-content) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
}

.settingsHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
}

.settingsHeaderLeft {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	min-width: 0;
	flex: 1;
}

.backButton {
	width: 32px !important;
	height: 32px !important;
	padding: var(--spacing--4xs) var(--spacing--2xs);
	font-size: var(--font-size--md);
	flex-shrink: 0;
}

.icon {
	flex-shrink: 0;
	flex-grow: 0;
}

.title {
	font-size: var(--font-size--md);
	font-weight: var(--font-weight--regular);
	line-height: var(--line-height--lg);
	color: var(--color--text--shade-1);
	flex: 1;
	min-width: 0;
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	padding-right: var(--spacing--md);
}

.searchInput {
	padding-bottom: var(--spacing--sm);
	width: 100%;
}

.section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.toolsList {
	display: flex;
	flex-direction: column;
}

.emptyState {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--spacing--xl);
}

.footer {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: var(--spacing--2xs);
	width: 100%;
	padding: var(--spacing--sm);
}
</style>
