import WebSocket from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';

const server = http.createServer();
const wss = new WebSocket.Server({ server });

interface GameAction {
    id: string;
}

let gameState: any = {};
let gameStateId: string = "";
let gameStateServerTimeEstimate: number = Date.now();
let unhandledActions: GameAction[] = [];
let clients: Record<string, WebSocket> = {};

function send(socket: WebSocket, data: any): void {
    socket.send(JSON.stringify(data));
}

function broadcast(data: any): void {
    wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
            send(client, data);
        }
    });
}

function broadcastExcept(socket: WebSocket, data: any): void {
    wss.clients.forEach((client: WebSocket) => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
            send(client, data);
        }
    });
}

wss.on('connection', (socket: WebSocket) => {
    const clientId = uuidv4();
    clients[clientId] = socket;

    console.log(`Client ${clientId} connected`); // Log when a client connects

    send(socket, {
        type: 'welcome',
        clientId,
        clients: Object.keys(clients),
    });

    for (const action of unhandledActions) {
        send(socket, {
            type: 'playerAction', action
        });
    }

    send(socket, {
        type: 'gameStateUpdate',
        state: gameState,
        handledActionIds: [],
        serverTimeEstimate: gameStateServerTimeEstimate,
        id: gameStateId
    });

    broadcastExcept(socket, { type: 'clientJoined', clientId });

    socket.on('message', (message: string) => {
        const data = JSON.parse(message);

        if (data.type === 'ping') {
            send(socket, {
                type: 'pong',
                payload: data.payload,
                serverTime: Date.now(),
            });
        } else if (data.type === 'gameStateUpdate') {
            console.log(data);
            if (data.basedOnId === gameStateId) {
                gameState = data.state;
                gameStateId = data.id;
                gameStateServerTimeEstimate = data.serverTimeEstimate;
                unhandledActions = unhandledActions.filter(
                    (action: GameAction) => !data.handledActionIds.includes(action.id)
                );
                broadcast({
                    type: 'gameStateUpdate',
                    state: gameState,
                    handledActionIds: data.handledActionIds,
                    serverTimeEstimate: gameStateServerTimeEstimate,
                    id: gameStateId,
                    basedOnId: data.basedOnId
                });
            }
        } else if (data.type === 'playerAction') {
            unhandledActions.push(data.action);
            broadcast({ type: 'playerAction', action: data.action });
        }
    });

    socket.on('close', () => {
        delete clients[clientId];
        broadcast({ type: 'clientLeft', clientId });
        console.log(`Client ${clientId} disconnected`); // Log when a client disconnects
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
