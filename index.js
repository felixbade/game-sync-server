const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let gameState = {};
let unhandledActions = [];
let clients = {};

function send(socket, data) {
    socket.send(JSON.stringify(data));
}

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            send(client, data);
        }
    });
}

function broadcastExcept(socket, data) {
    wss.clients.forEach((client) => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
            send(client, data);
        }
    });
}

wss.on('connection', (socket) => {
    const clientId = uuidv4();
    clients[clientId] = socket;

    send(socket, {
        type: 'welcome',
        clientId,
        gameState,
        unhandledActions,
        clients: Object.keys(clients),
    });

    broadcastExcept(socket, { type: 'clientJoined', clientId });

    socket.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'ping') {
            send(socket, {
                type: 'pong',
                payload: data.payload,
                serverTime: Date.now(),
            });
        } else if (data.type === 'gameStateUpdate') {
            if (data.basedOnId === gameState.id) {
                gameState = data.state;
                unhandledActions = unhandledActions.filter(
                    (action) => !data.handledActionIds.includes(action.id)
                );
                broadcast({ type: 'gameStateUpdate', state: gameState });
            }
        } else if (data.type === 'playerAction') {
            unhandledActions.push(data);
            broadcast({ type: 'playerAction', action: data });
        }
    });

    socket.on('close', () => {
        delete clients[clientId];
        broadcast({ type: 'clientLeft', clientId });
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
