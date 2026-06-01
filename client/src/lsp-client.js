import { MonacoLanguageClient } from 'monaco-languageclient';
import { CloseAction, ErrorAction } from 'vscode-languageclient';
import { WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';

export async function createLanguageClient(language, serverUrl) {

    const webSocket = new WebSocket(`${serverUrl}?language=${language}`);

    return new Promise((resolve) => {
        webSocket.onopen = () => {
            const socket = {
                reader: new WebSocketMessageReader(webSocket),
                writer: new WebSocketMessageWriter(webSocket)
            };

            const languageClient = createClient(language, socket);
            languageClient.start();

            socket.reader.onClose(() => languageClient.stop());
            resolve(languageClient);
        };
    });
}

function createClient(language, socket) {
    return new MonacoLanguageClient({
        name: `${language.toUpperCase()} Language Client`,
        clientOptions: {
            documentSelector: [language],
            errorHandler: {
                error: () => ({ action: ErrorAction.Continue }),
                closed: () => ({ action: CloseAction.DoNotRestart })
            }
        },
        connectionProvider: {
            get: () => {
                return Promise.resolve(socket);
            }
        }
    });
}
