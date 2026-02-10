<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAgentsStore } from './agents.store';
import AgentCard from './AgentCard.vue';

const agentsStore = useAgentsStore();
const canvasRef = ref<HTMLElement>();

let dragState: {
	agentId: string;
	offsetX: number;
	offsetY: number;
} | null = null;

onMounted(async () => {
	await agentsStore.fetchAgents();
});

function onDragStart(agentId: string, event: PointerEvent) {
	const agent = agentsStore.agents.find((a) => a.id === agentId);
	if (!agent || !canvasRef.value) return;

	const canvasRect = canvasRef.value.getBoundingClientRect();
	dragState = {
		agentId,
		offsetX: event.clientX - canvasRect.left - agent.position.x,
		offsetY: event.clientY - canvasRect.top - agent.position.y,
	};

	window.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(event: PointerEvent) {
	if (!dragState || !canvasRef.value) return;

	const canvasRect = canvasRef.value.getBoundingClientRect();
	const x = event.clientX - canvasRect.left - dragState.offsetX;
	const y = event.clientY - canvasRect.top - dragState.offsetY;

	agentsStore.updatePosition(dragState.agentId, {
		x: Math.max(0, x),
		y: Math.max(0, y),
	});
}

function onPointerUp() {
	dragState = null;
	window.removeEventListener('pointermove', onPointerMove);
	window.removeEventListener('pointerup', onPointerUp);
}
</script>

<template>
	<main :class="$style.container">
		<div :class="$style.header">
			<h1 :class="$style.title">Agent OS</h1>
			<span :class="$style.subtitle">{{ agentsStore.agents.length }} agents</span>
		</div>
		<div ref="canvasRef" :class="$style.canvas" data-testid="agents-canvas">
			<AgentCard
				v-for="agent in agentsStore.agents"
				:key="agent.id"
				:agent="agent"
				@drag-start="onDragStart"
			/>
			<div v-if="agentsStore.agents.length === 0" :class="$style.empty">
				No agents found. Start n8n to seed agent users.
			</div>
		</div>
	</main>
</template>

<style lang="scss" module>
.container {
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.header {
	display: flex;
	align-items: baseline;
	gap: var(--spacing--sm);
	padding: var(--spacing--lg) var(--spacing--xl);
	border-bottom: var(--border);
	background: var(--color--background);
	flex-shrink: 0;
	z-index: 1;
}

.title {
	font-size: var(--font-size--2xl);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	margin: 0;
}

.subtitle {
	font-size: var(--font-size--sm);
	color: var(--color--text--tint-2);
}

.canvas {
	flex: 1;
	position: relative;
	overflow: hidden;
	background-color: var(--color--background--light-2);
	background-image: radial-gradient(circle, var(--color--foreground--tint-1) 1px, transparent 1px);
	background-size: 20px 20px;
}

.empty {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	color: var(--color--text--tint-2);
	font-size: var(--font-size--md);
}
</style>
