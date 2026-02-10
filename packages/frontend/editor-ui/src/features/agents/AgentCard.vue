<script setup lang="ts">
import { ref } from 'vue';
import type { AgentNode } from './agents.store';

const props = defineProps<{
	agent: AgentNode;
}>();

const emit = defineEmits<{
	dragStart: [id: string, event: PointerEvent];
}>();

const isHovered = ref(false);

const statusColor: Record<string, string> = {
	idle: 'var(--color--foreground--tint-1)',
	active: 'var(--color--success)',
	busy: 'var(--color--warning)',
};

function onPointerDown(event: PointerEvent) {
	emit('dragStart', props.agent.id, event);
}
</script>

<template>
	<div
		:class="$style.card"
		:style="{
			left: `${agent.position.x}px`,
			top: `${agent.position.y}px`,
		}"
		data-testid="agent-card"
		@pointerdown="onPointerDown"
		@mouseenter="isHovered = true"
		@mouseleave="isHovered = false"
	>
		<div :class="$style.avatar">
			<span :class="$style.emoji">{{ agent.emoji }}</span>
		</div>
		<div :class="$style.info">
			<div :class="$style.name">{{ agent.firstName }}</div>
			<div :class="$style.role">{{ agent.role }}</div>
		</div>
		<div :class="$style.statusDot" :style="{ backgroundColor: statusColor[agent.status] }" />
	</div>
</template>

<style lang="scss" module>
.card {
	position: absolute;
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	padding: var(--spacing--xs) var(--spacing--sm);
	background: var(--color--background);
	border: var(--border);
	border-radius: var(--radius--xl);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	cursor: grab;
	user-select: none;
	transition:
		box-shadow 0.15s ease,
		transform 0.15s ease;
	min-width: 180px;

	&:hover {
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		transform: translateY(-1px);
	}

	&:active {
		cursor: grabbing;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
		transform: translateY(-2px);
	}
}

.avatar {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	background: linear-gradient(135deg, var(--color--primary--tint-2), var(--color--primary--tint-3));
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.emoji {
	font-size: var(--font-size--xl);
	line-height: 1;
}

.info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.name {
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.role {
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-2);
	white-space: nowrap;
}

.statusDot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
	margin-left: auto;
}
</style>
