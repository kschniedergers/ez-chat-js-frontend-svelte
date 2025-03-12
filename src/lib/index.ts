import { ChatRoomConnection } from '@ezchat/frontend';
import type { ChatRoomMessagePayload } from '@ezchat/frontend/build/esm/types.js';
import { writable } from 'svelte/store';

export function connectToRoom(
	roomId: number,
	args: {
		authFunction: () => Promise<string>;
		authToken: string;
		maxMessageHistory?: number;
		messagesPerPage?: number;
	}
) {
	const messagesStore = writable<ChatRoomMessagePayload[]>([]);

	const isLoadingStore = writable(false);
	const isConnectedStore = writable(false);
	const isErrorStore = writable<string | null>(null);

	const isLoadingMoreMessagesStore = writable(false);
	const isLoadingMoreMessagesErrorStore = writable<string | null>(null);

	const ezChatConnection = new ChatRoomConnection({
		roomId,
		authFunction: args.authFunction,
		authToken: args.authToken,
		messageCallback: (message) => {
			messagesStore.update((messages) => [...messages, message]);
		}
	});

	return { messagesStore };
}
