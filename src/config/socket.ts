import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

let io: SocketIOServer;

// Maps userId → socket.id for targeted event delivery
export const userSocketMap = new Map<string, string>();

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket: Socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        // Flutter emits 'register' with userId after connecting
        socket.on('register', (userId: string) => {
            userSocketMap.set(userId, socket.id);
            console.log(`[Socket] Registered userId=${userId} → socketId=${socket.id}`);
        });

        socket.on('disconnect', () => {
            // Clean up mapping when client disconnects
            for (const [userId, sid] of userSocketMap.entries()) {
                if (sid === socket.id) {
                    userSocketMap.delete(userId);
                    console.log(`[Socket] Unregistered userId=${userId}`);
                    break;
                }
            }
        });
    });

    return io;
}

export function getIO(): SocketIOServer {
    if (!io) throw new Error('[Socket] Socket.IO not initialized. Call initSocketIO first.');
    return io;
}
