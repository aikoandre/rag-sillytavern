# SillyTavern RAG Extension

This extension provides a user interface and integration layer for connecting SillyTavern to a RAG (Retrieval-Augmented Generation) service. It automatically captures conversations and intelligently injects relevant memories into the AI context.

## Features

-   **Automatic Integration:** Seamlessly adds user and AI messages to memory and injects relevant memories into AI context.
-   **Memory Management:** Tools to add, query, and delete memories per chat or globally.
-   **Real-time Status:** Live monitoring of RAG service health and memory statistics.
-   **User-Friendly Interface:** Simple controls for manual memory management and configuration.
-   **Smart Defaults:** Intelligent memory selection works automatically without complex configuration.

## How It Works

This extension acts as a bridge between SillyTavern and a RAG service:

-   **Message Capture:** Automatically captures user and AI messages when enabled.
-   **Memory Integration:** Communicates with the RAG service to store and retrieve memories.
-   **Context Injection:** Intelligently injects the most relevant memories into the AI context during generation.
-   **User Interface:** Provides controls for manual memory management and configuration.

## Installation

### Prerequisites

-   **RAG Service:** This extension requires a compatible RAG service running on `http://127.0.0.1:5000`. The service handles embedding generation, memory storage, and retrieval.

### Installing the Extension

1.  **Copy Extension Files:** Copy the `rag_extension_for_sillytavern` folder to your SillyTavern's `public/third-party/` directory.
2.  **Enable Extension:**
    -   Open SillyTavern and go to the "Extensions" tab.
    -   Find "RAG Extension" in the list and enable it.
    -   The extension settings will appear in the extensions panel.

## How to Use

1.  **Start the RAG Service:** Make sure your RAG service is running on `http://127.0.0.1:5000`.
2.  **Open SillyTavern:** Navigate to the extensions settings panel for the RAG extension.
3.  **Check Status:** The "Service Status" indicator should show as connected. If not, the service is not running or unreachable.

### Basic Usage

-   **Add Memories:** Type text into the "Add Memory" box and click the button to manually add memories.
-   **Query Memories:** Type a query into the "Query Memories" box and click "Query" to see relevant memories.
-   **View Statistics:** Check the memory counts and token usage in the statistics section.

### Automatic Features

The extension includes several automatic features that work seamlessly:

-   **Auto-Memory:** Automatically adds user and AI messages to memory (can be toggled).
-   **Context Integration:** Intelligently injects relevant memories into AI context during generation.
-   **Recent Messages:** Includes recent conversation history for better context continuity.

### Memory Management

-   **Sync Chat History:** Bulk-add all messages from the current chat to memory.
-   **Delete Current Chat:** Remove all memories from the current character and chat.
-   **Delete All Memories:** Nuclear option to clear all memories (requires confirmation).

### Configuration Options

-   **Reranking Parameters:** Adjust how many memories are processed (default: 100) and returned (default: 10).
-   **Integration Settings:** Control automatic memory addition and context injection.

## Extension Files

This extension consists of the following files:

-   **`index.js`** - Main extension logic and SillyTavern integration
-   **`memory_client.js`** - Communication layer for the RAG service API
-   **`settings.html`** - User interface for the extension settings
-   **`style.css`** - Styling for the extension UI
-   **`manifest.json`** - Extension metadata and configuration

## API Communication

The extension communicates with the RAG service through these endpoints:

-   **`/add`** - Add new memories
-   **`/query`** - Query for relevant memories
-   **`/status`** - Check service health and memory statistics
-   **`/delete_memories`** - Delete memories with optional filtering
-   **`/recent`** - Get recent messages for context

## Configuration

The extension uses intelligent memory selection with these default settings:

-   **Relevance Threshold:** Only memories with >70% relevance are considered
-   **Dynamic Count:** Returns 2-8 memories based on relevance scores
-   **Quality Focus:** Prioritizes highly relevant memories over fixed counts

These settings work automatically without requiring user configuration.