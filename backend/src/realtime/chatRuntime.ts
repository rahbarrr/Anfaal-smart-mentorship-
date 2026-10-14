import type { Server } from 'socket.io';

let chatIo: Server | null = null;

export function setChatIo(io: Server) {
  chatIo = io;
}

export function emitChatMessage(conversationId: string, message: unknown) {
  chatIo?.to(`conversation:${conversationId}`).emit('chat:message', message);
}
