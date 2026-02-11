<script setup lang="ts">
import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import type { CodeExecutionMode, CodeNodeEditorLanguage, INodeExecutionData } from 'n8n-workflow';
import { format } from 'prettier';
import jsParser from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';

import { CODE_NODE_TYPE } from '@/app/constants';
import { codeNodeEditorEventBus } from '@/app/event-bus';
import { useRootStore } from '@n8n/stores/useRootStore';

import { useCodeEditor } from '../../composables/useCodeEditor';
import { useI18n } from '@n8n/i18n';
import { useMessage } from '@/app/composables/useMessage';
import { useTelemetry } from '@/app/composables/useTelemetry';
import { useDataSchema } from '@/app/composables/useDataSchema';
import { DEBOUNCE_TIME, getDebounceTime } from '@/app/constants/durations';
import AskAI from './AskAI/AskAI.vue';
import { CODE_PLACEHOLDERS } from './constants';
import { useLinter } from './linter';
import { useSettingsStore } from '@/app/stores/settings.store';
import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { dropInCodeEditor } from '../../plugins/codemirror/dragAndDrop';
import { inlineCopilot } from '../../plugins/codemirror/ai-autocomplete';
import { generateCodeForPrompt } from '@/features/ai/assistant/assistant.api';
import type { AskAiRequest } from '@/features/ai/assistant/assistant.types';
import { useNDVStore } from '@/features/ndv/shared/ndv.store';
import { executionDataToJson } from '@/app/utils/nodeTypesUtils';
import type { INodeUi, Schema, TargetNodeParameterContext } from '@/Interface';
import { valueToInsert } from './utils';
import DraggableTarget from '@/app/components/DraggableTarget.vue';

import { ElTabPane, ElTabs } from 'element-plus';
export type CodeNodeLanguageOption = CodeNodeEditorLanguage | 'pythonNative';

type Props = {
	mode: CodeExecutionMode;
	modelValue: string;
	aiButtonEnabled?: boolean;
	fillParent?: boolean;
	language?: CodeNodeLanguageOption;
	isReadOnly?: boolean;
	rows?: number;
	id?: string;
	targetNodeParameterContext?: TargetNodeParameterContext;
	disableAskAi?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
	aiButtonEnabled: false,
	fillParent: false,
	language: 'javaScript',
	isReadOnly: false,
	rows: 4,
	id: () => crypto.randomUUID(),
	targetNodeParameterContext: undefined,
	disableAskAi: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const message = useMessage();
const tabs = ref(['code', 'ask-ai']);
const activeTab = ref('code');
const isLoadingAIResponse = ref(false);
const codeNodeEditorRef = ref<HTMLDivElement>();
const codeNodeEditorContainerRef = ref<HTMLDivElement>();
const hasManualChanges = ref(false);

const rootStore = useRootStore();
const i18n = useI18n();
const telemetry = useTelemetry();
const ndvStore = useNDVStore();
const settingsStore = useSettingsStore();
const workflowsStore = useWorkflowsStore();
const { getSchemaForExecutionData, getInputDataWithPinned } = useDataSchema();

const INLINE_AI_PREFIX_MAX_CHARS = 1_800;
const INLINE_AI_SUFFIX_MAX_CHARS = 500;
const INLINE_AI_CONTEXT_PREFIX_LINES = 18;
const INLINE_AI_CONTEXT_SUFFIX_LINES = 8;
const INLINE_AI_DEBOUNCE_MS = getDebounceTime(DEBOUNCE_TIME.INPUT.SEARCH);

const linter = useLinter(
	() => props.mode,
	() => (props.language === 'pythonNative' ? 'python' : props.language),
	() => workflowsStore.workflow.settings?.binaryMode,
);
const askAiEnabled = computed(() => {
	return !props.disableAskAi && settingsStore.isAskAiEnabled && props.language === 'javaScript';
});

const isInlineAiBackendReady = computed(() => {
	const aiAssistant = settingsStore.settings?.aiAssistant;
	return Boolean(aiAssistant?.enabled && aiAssistant?.setup);
});

const inlineAiExtensions = computed<Extension[]>(() => {
	if (!askAiEnabled.value || !isInlineAiBackendReady.value || props.isReadOnly) {
		return [];
	}

	return [inlineCopilot(onInlineAiSuggestionRequest, INLINE_AI_DEBOUNCE_MS)];
});

const extensions = computed(() => [linter.value, ...inlineAiExtensions.value]);
const placeholder = computed(() => CODE_PLACEHOLDERS[props.language]?.[props.mode] ?? '');
const dragAndDropEnabled = computed(() => {
	return !props.isReadOnly;
});

const { highlightLine, readEditorValue, editor, focus } = useCodeEditor({
	id: props.id,
	editorRef: codeNodeEditorRef,
	language: () => props.language,
	languageParams: () => ({ mode: props.mode }),
	editorValue: () => props.modelValue,
	placeholder,
	extensions,
	isReadOnly: () => props.isReadOnly,
	theme: {
		maxHeight: props.fillParent ? '100%' : '40vh',
		minHeight: '20vh',
		rows: props.rows,
	},
	onChange: onEditorUpdate,
	targetNodeParameterContext: () => props.targetNodeParameterContext,
});

onMounted(() => {
	if (!props.isReadOnly) codeNodeEditorEventBus.on('highlightLine', highlightLine);
	codeNodeEditorEventBus.on('codeDiffApplied', diffApplied);

	if (!props.modelValue) {
		emit('update:modelValue', placeholder.value);
	}
});

onBeforeUnmount(() => {
	codeNodeEditorEventBus.off('codeDiffApplied', diffApplied);
	if (!props.isReadOnly) codeNodeEditorEventBus.off('highlightLine', highlightLine);
});

watch([() => props.language, () => props.mode], (_, [prevLanguage, prevMode]) => {
	if (readEditorValue().trim() === CODE_PLACEHOLDERS[prevLanguage]?.[prevMode]) {
		emit('update:modelValue', placeholder.value);
	}
});

async function onBeforeTabLeave(_activeName: string | number, oldActiveName: string | number) {
	// Confirm dialog if leaving ask-ai tab during loading
	if (oldActiveName === 'ask-ai' && isLoadingAIResponse.value) {
		const confirmModal = await message.alert(i18n.baseText('codeNodeEditor.askAi.sureLeaveTab'), {
			title: i18n.baseText('codeNodeEditor.askAi.areYouSure'),
			confirmButtonText: i18n.baseText('codeNodeEditor.askAi.switchTab'),
			showClose: true,
			showCancelButton: true,
		});

		return confirmModal === 'confirm';
	}

	return true;
}

async function onAiReplaceCode(code: string) {
	const formattedCode = await format(code, {
		parser: 'babel',
		plugins: [jsParser, estree],
	});

	emit('update:modelValue', formattedCode);

	activeTab.value = 'code';
	hasManualChanges.value = false;
}

function onEditorUpdate(viewUpdate: ViewUpdate) {
	trackCompletion(viewUpdate);
	hasManualChanges.value = true;
	emit('update:modelValue', readEditorValue());
}

function diffApplied() {
	codeNodeEditorContainerRef.value?.classList.add('flash-editor');
	codeNodeEditorContainerRef.value?.addEventListener('animationend', () => {
		codeNodeEditorContainerRef.value?.classList.remove('flash-editor');
	});
}

function getInlineAiParentNodes() {
	const activeNode = ndvStore.activeNode;
	const { workflowObject, getNodeByName } = workflowsStore;

	if (!activeNode || !workflowObject) return [];

	return workflowObject
		.getParentNodesByDepth(activeNode.name)
		.filter(({ name }: { name: string }, i: number, nodes: Array<{ name: string }>) => {
			return (
				name !== activeNode.name &&
				nodes.findIndex((node: { name: string }) => node.name === name) === i
			);
		})
		.map((node: { name: string }) => getNodeByName(node.name))
		.filter((node): node is INodeUi => node !== null);
}

function getInlineAiSchemas(parentNodes: INodeUi[]) {
	const parentNodeNames = parentNodes.map((node) => node.name);
	const parentNodeSchemas: Array<{ nodeName: string; schema: Schema }> = parentNodes
		.map((node) => {
			const inputData: INodeExecutionData[] = getInputDataWithPinned(node);

			return {
				nodeName: node.name,
				schema: getSchemaForExecutionData(executionDataToJson(inputData), true),
			};
		})
		.filter((node) => node.schema?.value.length > 0);

	const inputSchema = parentNodeSchemas.shift() ?? {
		nodeName: parentNodeNames[0] ?? '',
		schema: { path: '', type: 'undefined', value: '' },
	};

	return {
		inputSchema,
		schema: parentNodeSchemas,
	};
}

function trimPrefix(prefix: string): string {
	return prefix.slice(-INLINE_AI_PREFIX_MAX_CHARS);
}

function trimSuffix(suffix: string): string {
	return suffix.slice(0, INLINE_AI_SUFFIX_MAX_CHARS);
}

function getCursorContextWindow(
	prefix: string,
	suffix: string,
): { prefixWindow: string; suffixWindow: string } {
	const prefixWindow = prefix.split('\n').slice(-INLINE_AI_CONTEXT_PREFIX_LINES).join('\n');
	const suffixWindow = suffix.split('\n').slice(0, INLINE_AI_CONTEXT_SUFFIX_LINES).join('\n');

	return {
		prefixWindow,
		suffixWindow,
	};
}

function buildInlineAiQuestion(
	prefix: string,
	suffix: string,
	metadata: {
		mode: CodeExecutionMode;
		activeNodeName: string;
		inputNodeName: string;
		schemaCount: number;
	},
): string {
	const { prefixWindow, suffixWindow } = getCursorContextWindow(prefix, suffix);
	const { mode, activeNodeName, inputNodeName, schemaCount } = metadata;

	return [
		'Complete JavaScript code at cursor.',
		'Return only the insertion for <FILL_ME> and nothing else.',
		'Do not use markdown and do not repeat surrounding code.',
		`Execution mode: ${mode}. Active node: ${activeNodeName}. Input node: ${inputNodeName}. Parent schemas available: ${schemaCount > 0 ? 'yes' : 'no'}.`,
		`${prefixWindow}<FILL_ME>${suffixWindow}`,
	].join('\n');
}

function buildInlineAiFallbackQuestion(
	prefix: string,
	suffix: string,
	metadata: {
		mode: CodeExecutionMode;
		activeNodeName: string;
		inputNodeName: string;
		schemaCount: number;
	},
): string {
	const { prefixWindow, suffixWindow } = getCursorContextWindow(prefix, suffix);
	const { mode, activeNodeName, inputNodeName, schemaCount } = metadata;

	return [
		'Complete JavaScript code at cursor.',
		'Return only insertion for <FILL_ME>.',
		`Mode=${mode}; ActiveNode=${activeNodeName}; InputNode=${inputNodeName}; ParentSchemaCount=${schemaCount}.`,
		`${prefixWindow}<FILL_ME>${suffixWindow}`,
	].join('\n');
}

function buildInlineAiMinimalQuestion(prefix: string, suffix: string): string {
	return [
		'Complete JavaScript code at cursor.',
		'Return only insertion for <FILL_ME>.',
		`${prefix}<FILL_ME>${suffix}`,
	].join('\n');
}

function extractSuggestionFromFillMarker(prediction: string): string | null {
	const marker = '<FILL_ME>';
	if (!prediction.includes(marker)) {
		return null;
	}

	const [, ...afterParts] = prediction.split(marker);
	const after = afterParts.join(marker);
	return after.trim();
}

function normalizeInlineSuggestion(prediction: string, prefix: string, suffix: string): string {
	const withoutCodeFence = prediction
		.replace(/^```[a-zA-Z]*\s*/, '')
		.replace(/\s*```$/, '')
		.trim();

	if (!withoutCodeFence) {
		return '';
	}

	const markerExtracted = extractSuggestionFromFillMarker(withoutCodeFence);
	if (markerExtracted) {
		return markerExtracted;
	}

	if (withoutCodeFence.startsWith(prefix) && withoutCodeFence.endsWith(suffix)) {
		return withoutCodeFence.slice(prefix.length, withoutCodeFence.length - suffix.length).trim();
	}

	if (withoutCodeFence.startsWith(prefix)) {
		return withoutCodeFence.slice(prefix.length).trim();
	}

	return withoutCodeFence;
}

function isBadRequestError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	if ('httpStatusCode' in error && error.httpStatusCode === 400) {
		return true;
	}

	if ('response' in error && typeof error.response === 'object' && error.response !== null) {
		const response = error.response;
		if ('status' in response && response.status === 400) {
			return true;
		}
	}

	return false;
}

async function onInlineAiSuggestionRequest(prefix: string, suffix: string): Promise<string> {
	const activeNode = ndvStore.activeNode;

	if (!activeNode || !askAiEnabled.value || !isInlineAiBackendReady.value || props.isReadOnly) {
		return '';
	}

	const trimmedPrefix = trimPrefix(prefix);
	const trimmedSuffix = trimSuffix(suffix);

	// Avoid expensive calls while the context is still tiny.
	if (trimmedPrefix.trim().length < 12) {
		return '';
	}

	const parentNodes = getInlineAiParentNodes();
	const schemas = getInlineAiSchemas(parentNodes);
	const richQuestion = buildInlineAiQuestion(trimmedPrefix, trimmedSuffix, {
		mode: props.mode,
		activeNodeName: activeNode.name,
		inputNodeName: schemas.inputSchema.nodeName,
		schemaCount: schemas.schema.length,
	});

	const payloadBase: Omit<AskAiRequest.RequestPayload, 'question'> = {
		context: {
			schema: schemas.schema,
			inputSchema: schemas.inputSchema,
			ndvPushRef: ndvStore.pushRef,
			pushRef: rootStore.pushRef,
		},
		forNode: 'code',
	};

	try {
		const { code } = await generateCodeForPrompt(rootStore.restApiContext, {
			...payloadBase,
			question: richQuestion,
		});
		return normalizeInlineSuggestion(code, trimmedPrefix, trimmedSuffix);
	} catch (error) {
		if (!isBadRequestError(error)) {
			return '';
		}

		try {
			const { code } = await generateCodeForPrompt(rootStore.restApiContext, {
				...payloadBase,
				question: buildInlineAiFallbackQuestion(trimmedPrefix, trimmedSuffix, {
					mode: props.mode,
					activeNodeName: activeNode.name,
					inputNodeName: schemas.inputSchema.nodeName,
					schemaCount: schemas.schema.length,
				}),
			});
			return normalizeInlineSuggestion(code, trimmedPrefix, trimmedSuffix);
		} catch (fallbackError) {
			if (!isBadRequestError(fallbackError)) {
				return '';
			}

			try {
				const { code } = await generateCodeForPrompt(rootStore.restApiContext, {
					...payloadBase,
					question: buildInlineAiMinimalQuestion(trimmedPrefix, trimmedSuffix),
				});
				return normalizeInlineSuggestion(code, trimmedPrefix, trimmedSuffix);
			} catch {
				return '';
			}
		}
	}
}

function trackCompletion(viewUpdate: ViewUpdate) {
	const completionTx = viewUpdate.transactions.find((tx) => tx.isUserEvent('input.complete'));

	if (!completionTx) return;

	try {
		// @ts-expect-error - undocumented fields
		const { fromA, toB } = viewUpdate?.changedRanges[0];
		const full = viewUpdate.state.doc.slice(fromA, toB).toString();
		const lastDotIndex = full.lastIndexOf('.');

		let context = null;
		let insertedText = null;

		if (lastDotIndex === -1) {
			context = '';
			insertedText = full;
		} else {
			context = full.slice(0, lastDotIndex);
			insertedText = full.slice(lastDotIndex + 1);
		}

		// TODO: Still has to get updated for Python and JSON
		telemetry.track('User autocompleted code', {
			instance_id: rootStore.instanceId,
			node_type: CODE_NODE_TYPE,
			field_name: props.mode === 'runOnceForAllItems' ? 'jsCodeAllItems' : 'jsCodeEachItem',
			field_type: 'code',
			context,
			inserted_text: insertedText,
		});
	} catch {}
}

function onAiLoadStart() {
	isLoadingAIResponse.value = true;
}

function onAiLoadEnd() {
	isLoadingAIResponse.value = false;
}

async function onDrop(value: string, event: MouseEvent) {
	if (!editor.value) return;

	await dropInCodeEditor(
		toRaw(editor.value),
		event,
		valueToInsert(value, props.language, props.mode, workflowsStore.workflow.settings?.binaryMode),
	);
}

defineExpose({
	focus,
});
</script>

<template>
	<div
		ref="codeNodeEditorContainerRef"
		:class="['code-node-editor', $style['code-node-editor-container']]"
	>
		<ElTabs
			v-if="askAiEnabled"
			ref="tabs"
			v-model="activeTab"
			type="card"
			:before-leave="onBeforeTabLeave"
			:class="$style.tabs"
		>
			<ElTabPane
				:label="i18n.baseText('codeNodeEditor.tabs.code')"
				name="code"
				data-test-id="code-node-tab-code"
				:class="$style.fillHeight"
			>
				<DraggableTarget
					type="mapping"
					:disabled="!dragAndDropEnabled"
					:class="$style.fillHeight"
					@drop="onDrop"
				>
					<template #default="{ activeDrop, droppable }">
						<div
							ref="codeNodeEditorRef"
							:class="[
								'ph-no-capture',
								'code-editor-tabs',
								$style.editorInput,
								$style.fillHeight,
								{ [$style.activeDrop]: activeDrop, [$style.droppable]: droppable },
							]"
						/>
					</template>
				</DraggableTarget>
				<slot name="suffix" />
			</ElTabPane>
			<ElTabPane
				:label="i18n.baseText('codeNodeEditor.tabs.askAi')"
				name="ask-ai"
				data-test-id="code-node-tab-ai"
			>
				<!-- Key the AskAI tab to make sure it re-mounts when changing tabs -->
				<AskAI
					:key="activeTab"
					:has-changes="hasManualChanges"
					:is-read-only="props.isReadOnly"
					@replace-code="onAiReplaceCode"
					@started-loading="onAiLoadStart"
					@finished-loading="onAiLoadEnd"
				/>
			</ElTabPane>
		</ElTabs>
		<!-- If AskAi not enabled, there's no point in rendering tabs -->
		<div v-else :class="$style.fillHeight">
			<DraggableTarget
				type="mapping"
				:disabled="!dragAndDropEnabled"
				:class="$style.fillHeight"
				@drop="onDrop"
			>
				<template #default="{ activeDrop, droppable }">
					<div
						ref="codeNodeEditorRef"
						:class="[
							'ph-no-capture',
							$style.fillHeight,
							$style.editorInput,
							{ [$style.activeDrop]: activeDrop, [$style.droppable]: droppable },
						]"
					/>
				</template>
			</DraggableTarget>
			<slot name="suffix" />
		</div>
	</div>
</template>

<style scoped lang="scss">
:deep(.el-tabs) {
	.cm-editor {
		border: 0;
	}
}

@keyframes backgroundAnimation {
	0% {
		background-color: none;
	}
	30% {
		background-color: rgba(41, 163, 102, 0.1);
	}
	100% {
		background-color: none;
	}
}

.flash-editor {
	:deep(.cm-editor),
	:deep(.cm-gutter) {
		animation: backgroundAnimation 1.5s ease-in-out;
	}
}
</style>

<style lang="scss" module>
.tabs {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.code-node-editor-container {
	position: relative;
}

.fillHeight {
	height: 100%;
}

.editorInput.droppable {
	:global(.cm-editor) {
		border-color: transparent;
		outline: 1.5px dashed var(--ndv--droppable-parameter--color);
		outline-offset: -1.5px;
	}
}

.editorInput.activeDrop {
	:global(.cm-editor) {
		border-color: var(--color--success);
		border-style: solid;
		cursor: grabbing;
		border-width: 1px;
		outline: none;
	}
}
</style>
