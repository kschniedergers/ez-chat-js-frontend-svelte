import { ChatRoomConnection } from '@ezchat/frontend';
import type {
	ChatRoomMessagePayload,
	ChatRoomWebsocketMessage
} from '@ezchat/frontend/build/esm/types.js';
import { writable } from 'svelte/store';

interface EzChatRoomConnectionConfig {
	authFunction?: () => Promise<string>;
	authToken?: string;
	includeLeaveJoinMessages?: boolean;
	reverseMessages?: boolean;
	maxMessages?: number;
	messagesPerPage?: number;
}

const defaultConfig: EzChatRoomConnectionConfig = {
	includeLeaveJoinMessages: false,
	reverseMessages: false,
	maxMessages: 200,
	messagesPerPage: 25
};

export function connectToRoom(roomId: number, config: EzChatRoomConnectionConfig) {
	const configWithDefaults = { ...defaultConfig, ...config };

	const messagesStore = writable<ChatRoomMessagePayload['payload'][]>([]);
	const isLoadingStore = writable(true);
	const isConnectedStore = writable(false);
	const isErrorStore = writable<Error | null>(null);
	const isLoadingMoreMessagesStore = writable(false);
	const isLoadingMoreMessagesErrorStore = writable<Error | null>(null);
	const cursorStore = writable<string | undefined>(undefined);

	// For sending messages
	let sendMessageFunction = (message: string) => {
		isErrorStore.set(new Error('sendMessage called before connecting to websocket'));
	};

	const authFunctionToUse = config.authFunction || (() => Promise.resolve(config.authToken || ''));

	const ezChatConnection = new ChatRoomConnection({
		roomId,
		authFunction: authFunctionToUse
	});

	// Function to fetch more messages
	const fetchMoreMessages = (amount = configWithDefaults.messagesPerPage || 25) => {
		let cursor: string | undefined;
		cursorStore.subscribe((value) => (cursor = value))();

		if (!cursor) {
			isLoadingMoreMessagesErrorStore.set(new Error('No more messages to fetch'));
			return;
		}

		let isLoading = false;
		isLoadingMoreMessagesStore.subscribe((value) => (isLoading = value))();

		if (isLoading) {
			return;
		}

		isLoadingMoreMessagesStore.set(true);
		ezChatConnection
			.fetchMessages(cursor, amount)
			.then(({ messages, nextCursor }) => {
				isLoadingMoreMessagesStore.set(false);
				messagesStore.update((prev) =>
					configWithDefaults.reverseMessages
						? [...messages.reverse(), ...prev]
						: [...prev, ...messages]
				);
				cursorStore.set(nextCursor);
			})
			.catch((err) => {
				isLoadingMoreMessagesStore.set(false);
				isLoadingMoreMessagesErrorStore.set(err);
				console.error(err);
			});
	};

	// Initial fetch and websocket connection
	ezChatConnection
		.fetchMessages()
		.then(({ messages, nextCursor }) => {
			messagesStore.set(configWithDefaults.reverseMessages ? messages.reverse() : messages);
			cursorStore.set(nextCursor);

			const connection = ezChatConnection.connectWebsocket({
				onClose: () => {
					isConnectedStore.set(false);
					isLoadingStore.set(false);
				},
				onError: (err) => {
					console.error(err);
					isErrorStore.set(new Error('A websocket error occurred: ' + err));
					isLoadingStore.set(false);
				},
				onOpen: () => {
					isConnectedStore.set(true);
					isLoadingStore.set(false);
					isErrorStore.set(null);
				},
				onMessage: (message: ChatRoomWebsocketMessage) => {
					switch (message.payloadType) {
						case 'join':
						case 'leave':
							// Will be implemented later for join/leave messages
							break;
						case 'message':
							messagesStore.update((prev) => {
								if (configWithDefaults.reverseMessages) {
									return [...prev, message.payload];
								} else {
									return [message.payload, ...prev];
								}
							});
							break;
						case 'delete_message':
							messagesStore.update((prev) =>
								prev.filter((m) => m.id !== message.payload.messageId)
							);
							break;
						case 'error':
							isErrorStore.set(new Error(message.payload.message));
							break;
					}
				}
			});

			sendMessageFunction = connection.sendMessage;
		})
		.catch((err) => {
			isLoadingStore.set(false);
			isErrorStore.set(err);
			console.error(err);
		});

	// Calculate hasMoreMessages derived store
	const hasMoreMessagesStore = {
		subscribe: (callback: (value: boolean) => void) => {
			return cursorStore.subscribe((cursor) => callback(cursor !== undefined));
		}
	};

	// Create a store for sendMessage function
	const sendMessageStore = writable(sendMessageFunction);

	return {
		messages: messagesStore,
		isLoading: isLoadingStore,
		isConnected: isConnectedStore,
		isError: isErrorStore,
		isLoadingMoreMessages: isLoadingMoreMessagesStore,
		isLoadingMoreMessagesError: isLoadingMoreMessagesErrorStore,
		hasMoreMessages: hasMoreMessagesStore,
		fetchMoreMessages,
		sendMessage: (message: string) => sendMessageFunction(message),
		refreshToken: () => ezChatConnection.refreshToken()
	};
}
