// SillyTavern RAG Extension - Memory Client
// This client handles communication with the Python RAG service API.

class MemoryClient {
    constructor(baseUrl = 'http://127.0.0.1:5000') {
        this.baseUrl = baseUrl;
    }

    /**
     * Adds a new memory to the RAG service.
     * @param {string} text The text of the memory to add.
     * @returns {Promise<object>} The server's response.
     */
    async addMemory(text) {
        try {
            const response = await fetch(`${this.baseUrl}/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
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
     * @param {number} top_k The number of candidates for initial retrieval.
     * @param {number} final_top_n The final number of memories to return.
     * @returns {Promise<object>} The query results, including reranked memories and token count.
     */
    async queryMemory(text, top_k, final_top_n) {
        try {
            const body = { text };
            if (top_k !== undefined) {
                body.top_k = top_k;
            }
            if (final_top_n !== undefined) {
                body.final_top_n = final_top_n;
            }

            const response = await fetch(`${this.baseUrl}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
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
}

// Export the class for use in other modules
export { MemoryClient };

// Example of how to use the client (for testing purposes)
// const client = new MemoryClient();
// client.addMemory('This is a test memory.').then(console.log);
// client.queryMemory('test').then(console.log);