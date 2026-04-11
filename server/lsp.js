import { WebSocketServer } from 'ws';
import * as rpc from 'vscode-ws-jsonrpc';
import * as server from 'vscode-ws-jsonrpc/server';
import path from 'path';

export function setupLsp(httpServer) {
    const wss = new WebSocketServer({
        noServer: true,
        path: '/lsp'
    });

    httpServer.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
        if (pathname === '/lsp') {
            wss.handleUpgrade(request, socket, head, (webSocket) => {
                const language = new URL(request.url, `http://${request.headers.host}`).searchParams.get('language');
                if (language === 'python') {
                    const socketAdapter = rpc.toSocket(webSocket);
                    const connection = server.createWebSocketConnection(socketAdapter);
                    launchLanguageServer(connection, 'python', ['-m', 'pylsp']);
                }
            });
        }
    });
}

function launchLanguageServer(connection, command, args) {
    const serverConnection = server.createServerProcess('python', command, args, {
        shell: true,
        env: process.env,
        cwd: path.resolve('./__user')
    });

    if (serverConnection) {
        server.forward(connection, serverConnection, message => {
            if (rpc.isRequestMessage(message) || rpc.isNotificationMessage(message)) {
                if (message.method === 'exit') {
                    serverConnection.dispose();
                }
            }
            return message;
        });

        connection.onClose(() => serverConnection.dispose());
        serverConnection.onClose(() => connection.dispose());
    }
}
