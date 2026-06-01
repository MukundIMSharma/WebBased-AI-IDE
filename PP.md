# Implementation Plan: WebCloud IDE & AI Assistant Evolution

This plan outlines the design and execution steps to transition the WebCloud IDE assistant backend to a **Model Context Protocol (MCP)** orchestrated architecture, establish **SQLite-based persistence**, secure command execution through **Docker sandboxing**, and implement a premium **Monaco DiffEditor** for visual AI code reviews.

---

## User Review Required

> [!IMPORTANT]
> 1. **Docker Command Sandboxing**: All shell execution or filesystem MCP tools **must** operate exclusively inside the user's isolated Docker environment via `containerExec`. Running tools natively on the host server will compromise security.
> 2. **NPM Dependencies**: We will need to install `sqlite3` for persistence and `@modelcontextprotocol/sdk` for MCP client and server components.

---

## Proposed Execution Plan

### Phase 1: Persistence & Streaming Foundation (SQLite & NDJSON)

Before introducing the complexity of tool calling and MCP, we will build a robust session database and a dynamic streaming protocol.

#### 1. Implement SQLite Database Manager
* **File**: [NEW] `server/db.js`
* **Details**: Establish a SQLite database using the standard `sqlite3` package to store chat history instead of the vulnerable `chats.json` file.
* **Schema**:
  * `chats`: `id` (TEXT, PK), `title` (TEXT), `createdAt` (INTEGER), `updatedAt` (INTEGER)
  * `messages`: `id` (TEXT, PK), `chatId` (TEXT, FK), `role` (TEXT), `content` (TEXT), `toolCalls` (TEXT - JSON serialized string of running/completed tool states), `createdAt` (INTEGER)

#### 2. Refactor AI Router for SQLite Persistence
* **File**: [MODIFY] `server/ai.js`
* **Details**: Replace all `getChats`, `saveChats`, and local JSON reads/writes with SQL queries. Ensure proper cleanup of related messages when a chat is deleted.

#### 3. Establish Newline-Delimited JSON (NDJSON) Streaming
* **Details**: 
  * Currently, the backend streams raw text, making it impossible to separate conversational text from structured tool execution logs.
  * We will refactor `/chats/:id/message` to stream chunks in NDJSON format:
    * `{"type": "text", "delta": "Hello "}`
    * `{"type": "tool_start", "name": "execute_command", "args": {"cmd": "npm test"}}`
    * `{"type": "tool_end", "name": "execute_command", "result": "..."}`
  * **File**: [MODIFY] `client/src/component/AIChat.jsx`
    * Update the stream reader loop to parse incoming chunks by dividing the buffer by newlines (`\n`) and deserializing them into JSON object states.

---

### Phase 2: Model Context Protocol (MCP) Integration

This phase establishes the client-side connections to multiple external MCP servers, as well as an in-process local IDE MCP server.

#### 1. Create Configurable MCP Client Manager
* **File**: [NEW] `server/mcpClient.js`
* **Details**: 
  * Read a config file at `server/config/mcp-servers.json` containing active external servers (e.g., web search, databases).
  * Initialize `@modelcontextprotocol/sdk` clients for each configured server.
  * Support both **Stdio** (local processes launched via `spawn`) and **SSE** (Server-Sent Events) network transports.

#### 2. Implement local "IDE MCP Server" (In-Process)
* **Details**: 
  * Rather than passing hardcoded workspace states via HTTP requests, create an in-process MCP Server that exposes active IDE context.
  * **Resources**:
    * `ide://active-file` (provides the content of the currently open editor file)
    * `ide://selection` (provides the text currently selected by the user)
  * **Tools**:
    * `read_workspace_file`: Securely fetches file contents inside the Docker container (`/home/user/workspace/`).
    * `write_workspace_file`: Securely writes contents to the Docker workspace.
    * `execute_workspace_command`: Runs terminal commands in the Docker container shell using `containerExec`.

#### 3. Implement LLM Tool Execution Loop
* **File**: [MODIFY] `server/ai.js`
* **Details**:
  * Retrieve all available tools from `mcpClient` (both external and local IDE tools).
  * Send the tools array to OpenAI.
  * Implement a recursive tool call resolution loop:
    * If OpenAI requests a tool call, pause user response streaming.
    * Stream a `tool_start` chunk to the client.
    * Dispatch the tool execution to the appropriate MCP client.
    * Stream a `tool_end` chunk.
    * Feed the tool result back into the OpenAI message list and request a follow-up completion.
    * Repeat until the LLM returns the final text response, streaming `text_delta` chunks continuously.

---

### Phase 3: Premium UI & Diff Review Experience

#### 1. Live Tool Execution Visualizers
* **File**: [MODIFY] `client/src/component/AIChat.jsx`
* **Details**: When receiving `tool_start` events, render a modern, glassmorphic indicator in the chat message block showing the tool name and input parameters (e.g., *"Executing command: `pytest` inside sandbox..."*). Render a checkmark or error badge when `tool_end` is received.

#### 2. Monaco DiffEditor Review Panel
* **File**: [MODIFY] `client/src/component/Editor.jsx`
* **Details**: 
  * Integrate Monaco's native `DiffEditor` component next to or in place of the standard `Editor`.
  * **UX Review Flow**:
    * When a user clicks **"Apply to Editor"** on a `<replace_block>` in `AIChat.jsx`, switch the Editor's display mode to `diff`.
    * Load the original file content into the left model and the suggested changes into the right model.
    * Render a sleek, absolute-positioned floating bar at the bottom:
      * **Accept Change** (Green, checkmark) -> Applies the edits to the main file model, saves to server, and toggles back to normal editor.
      * **Reject Change** (Red, cross) -> Restores normal editor mode without modifying the file.

---

## Verification Plan

### Automated Verification
* **Database Tests**: Run queries against SQLite to ensure chat sessions and messages with nested `toolCalls` serialized structures save and delete reliably.
* **MCP Handshake Verification**: Connect a mock MCP server and verify that the `mcpClient` discovers capabilities, fetches tools, and successfully triggers dummy tools.
* **Container Isolation Test**: Trigger a command-line tool via the LLM and verify it executes inside the isolated `ide_user_default` Docker shell, failing if it attempts to escape to the host node process.

### Manual Verification
1. Boot the backend server and client UI.
2. Select a file in the file explorer and highlight a section of code.
3. Open a new chat and ask: *"What does this function do and can you optimize it?"*
4. Verify that the AI fetches context lazily through MCP resources.
5. Ask the AI to write a test: verify the live tool indicator displays tool execution, runs `npm test` inside the container, and presents the test results.
6. Click *"Apply to Editor"* on a replacement block, review the changes inside the Monaco Diff view, and click *Accept* to merge.
