import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function socketUrl() {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL as string | undefined)?.trim();
  if (!apiUrl || apiUrl === '/api') return undefined;
  return apiUrl.replace(/\/api\/?$/, '');
}

export function connectChatSocket(token: string) {
  if (!socket) {
    socket = io(socketUrl(), {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
  }
  socket.auth = { token };
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectChatSocket() {
  socket?.disconnect();
  socket = null;
}
