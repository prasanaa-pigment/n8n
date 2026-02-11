import type { ChatHubConversationModel, ChatHubSessionDto } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import type {
	INode,
	IWorkflowBase,
	IWorkflowExecuteAdditionalData,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { createRunExecutionData, NodeConnectionTypes, OperationalError } from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';

import { WorkflowExecutionService } from '@/workflows/workflow-execution.service';

import { ChatHubExecutionStore } from './chat-hub-execution-store.service';
import type { NonStreamingResponseMode } from './chat-hub.types';
import { ChatHubMessageRepository } from './chat-message.repository';
import { ChatHubSessionRepository } from './chat-session.repository';
import { ChatStreamService } from './chat-stream.service';

@Service()
export class ScheduledChatTriggerService {
	constructor(
		private readonly logger: Logger,
		private readonly userRepository: UserRepository,
		private readonly sessionRepository: ChatHubSessionRepository,
		private readonly messageRepository: ChatHubMessageRepository,
		private readonly chatHubExecutionStore: ChatHubExecutionStore,
		private readonly chatStreamService: ChatStreamService,
		private readonly workflowExecutionService: WorkflowExecutionService,
	) {
		this.logger = this.logger.scoped('chat-hub');
	}

	async handleScheduledExecution(
		workflowData: IWorkflowBase,
		node: INode,
		_additionalData: IWorkflowExecuteAdditionalData,
		_mode: WorkflowExecuteMode,
	): Promise<void> {
		const targetUserId = node.parameters.targetUserId as string;
		const responseMode = (node.parameters.responseMode as NonStreamingResponseMode) ?? 'lastNode';

		if (!targetUserId) {
			this.logger.error('Scheduled Chat Trigger: targetUserId is not configured', {
				workflowId: workflowData.id,
			});
			return;
		}

		const user = await this.userRepository.findOneBy({ id: targetUserId });
		if (!user) {
			this.logger.error(
				`Scheduled Chat Trigger: user "${targetUserId}" not found. Skipping execution.`,
				{ workflowId: workflowData.id },
			);
			return;
		}

		const sessionId = uuidv4();
		const model: ChatHubConversationModel = {
			provider: 'n8n',
			workflowId: workflowData.id,
		};

		// Create chat hub session
		const sessionEntity = await this.sessionRepository.createChatSession({
			id: sessionId,
			ownerId: user.id,
			title: `Scheduled: ${workflowData.name}`,
			lastMessageAt: new Date(),
			provider: 'n8n',
			workflowId: workflowData.id,
			credentialId: null,
			model: null,
			agentId: null,
			agentName: workflowData.name,
			tools: [],
		});

		// Notify frontend about the new session
		const sessionDto: ChatHubSessionDto = {
			id: sessionEntity.id,
			title: sessionEntity.title,
			ownerId: sessionEntity.ownerId,
			lastMessageAt: sessionEntity.lastMessageAt?.toISOString() ?? null,
			credentialId: sessionEntity.credentialId,
			provider: sessionEntity.provider,
			model: sessionEntity.model,
			workflowId: sessionEntity.workflowId,
			agentId: sessionEntity.agentId,
			agentName: sessionEntity.agentName ?? workflowData.name,
			agentIcon: null,
			createdAt: sessionEntity.createdAt.toISOString(),
			updatedAt: sessionEntity.updatedAt.toISOString(),
			tools: sessionEntity.tools,
		};
		await this.chatStreamService.sendSessionCreated({
			userId: user.id,
			session: sessionDto,
		});

		// Use the ScheduledChatTrigger node itself as the start node
		const executionData = createRunExecutionData({
			executionData: {
				nodeExecutionStack: [
					{
						node,
						data: {
							[NodeConnectionTypes.Main]: [
								[
									{
										json: {
											sessionId,
											action: 'sendMessage',
											chatInput: '',
										},
									},
								],
							],
						},
						source: null,
					},
				],
			},
			manualData: {
				userId: user.id,
			},
		});

		// Force saving execution data for chat workflows
		const workflowDataWithSettings: IWorkflowBase = {
			...workflowData,
			settings: {
				...workflowData.settings,
				saveDataSuccessExecution: 'all',
			},
		};

		const messageId = uuidv4();

		// Notify frontend that execution has started and send stream begin
		// BEFORE starting the workflow, so the frontend receives these events
		// before any chunks/end events produced by the execution watcher.
		await this.chatStreamService.startExecution(user.id, sessionId);

		// Create AI message in DB (running state) — needed before execution
		// so the watcher can find it when the execution completes
		await this.messageRepository.createAIMessage({
			id: messageId,
			content: '',
			sessionId,
			executionId: undefined,
			model,
			previousMessageId: null,
			retryOfMessageId: null,
			status: 'running',
		});

		// Send stream begin event to frontend before execution starts
		await this.chatStreamService.startStream({
			userId: user.id,
			sessionId,
			messageId,
			previousMessageId: null,
			retryOfMessageId: null,
			executionId: null,
		});

		// Start the workflow execution
		const running = await this.workflowExecutionService.executeChatWorkflow(
			user,
			workflowDataWithSettings,
			executionData,
			undefined,
			false,
			'webhook',
		);

		const executionId = running.executionId;
		if (!executionId) {
			throw new OperationalError('There was a problem starting the scheduled chat execution.');
		}

		// Update the AI message with the execution ID now that we have it
		await this.messageRepository.updateChatMessage(messageId, {
			executionId: parseInt(executionId, 10),
		});

		// Register execution context for the watcher to handle completion
		await this.chatHubExecutionStore.register({
			executionId,
			sessionId,
			userId: user.id,
			messageId,
			previousMessageId: null,
			model,
			responseMode,
			awaitingResume: false,
			createMessageOnResume: false,
			workflowId: workflowData.id,
		});

		this.logger.info(
			`Scheduled chat execution started for workflow "${workflowData.name}" (session: ${sessionId}, execution: ${executionId})`,
			{
				workflowId: workflowData.id,
				sessionId,
				executionId,
				userId: user.id,
			},
		);
	}
}
