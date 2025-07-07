// SillyTavern RAG Extension - Memory Client
// This client handles communication with the Python RAG service API.

class MemoryClient {
    constructor(baseUrl = 'http://127.0.0.1:5000') {
        this.baseUrl = baseUrl;
    }

    /**
     * Adds a new memory to the RAG service.
     * @param {string} text The text of the memory to add.
     * @param {object} options Additional options like character_id, chat_id, message_type
     * @returns {Promise<object>} The server's response.
     */
    async addMemory(text, options = {}) {
        try {
            const payload = {
                text,
                ...options
            };

            const response = await fetch(`${this.baseUrl}/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error adding memory:', error);
            // In a real extension, you'd want to show this error to the user.
            return { error: 'Failed to connect to the RAG service.' };
        }
    }

    /**
     * Fetches the current status of the RAG service.
     * @returns {Promise<object>} The service status, including total memories.
     */
    async getServiceStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/status`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching service status:', error);
            return { error: 'Failed to connect to the RAG service for status.' };
        }
    }

    /**
     * Queries the RAG service for relevant memories.
     * @param {string} text The query text.
     * @param {object} options Query options including character_id, chat_id, top_k, final_top_n, etc.
     * @returns {Promise<object>} The query results, including reranked memories and token count.
     */
    async queryMemories(text, options = {}) {
        try {
            const payload = {
                text,
                ...options
            };

            const response = await fetch(`${this.baseUrl}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error querying memory:', error);
            return { error: 'Failed to connect to the RAG service.', results: [] };
        }
    }

    /**
     * Legacy method for backward compatibility
     */
    async queryMemory(text, top_k, final_top_n) {
        return this.queryMemories(text, { top_k, final_top_n });
    }

    /**
     * Gets recent messages for a specific character and chat.
     * @param {string} characterId The character ID.
     * @param {string} chatId The chat ID.
     * @param {number} maxMessages Maximum number of recent messages to retrieve.
     * @returns {Promise<object>} The recent messages and token count.
     */
    async getRecentMessages(characterId, chatId, maxMessages = 10) {
        try {
            const payload = {
                character_id: characterId,
                chat_id: chatId,
                max_messages: maxMessages
            };

            const response = await fetch(`${this.baseUrl}/recent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting recent messages:', error);
            return { error: 'Failed to connect to the RAG service.', recent_messages: [] };
        }
    }
}

// Export the class for use in other modules
export { MemoryClient };

// Example of how to use the client (for testing purposes)
// const client = new MemoryClient();
// client.addMemory('This is a test memory.').then(console.log);
// client.queryMemory('test').then(console.log);