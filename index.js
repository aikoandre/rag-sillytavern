// SillyTavern RAG Extension
// Core logic and UI hooks for the RAG extension.

import { getContext, extension_settings, saveMetadataDebounced, renderExtensionTemplateAsync } from '../../../extensions.js';
import { MemoryClient } from './memory_client.js';

(function () {
    const RAG_SERVICE_URL = 'http://127.0.0.1:5000';
    const client = new MemoryClient(RAG_SERVICE_URL);

    // --- UI Elements ---
    let addMemoryInput, addMemoryButton, queryInput, queryButton, resultsContainer, statusIndicator;
    let totalMemoriesSpan, lastQueryTokensSpan, fastRerankCountInput, finalMemoryCountInput;
    let autoMemoryToggle, contextIntegrationToggle, recentMessagesToggle;

    // Extension settings
    extension_settings.rag = extension_settings.rag || {
        auto_memory: true,
        context_integration: true,
        recent_messages_enabled: true,
        fast_rerank_count: 100,
        final_memory_count: 10
    };

    console.log('RAG: Extension settings loaded:', extension_settings.rag);

    async function initializeUI() {
        try {
            const settingsHtml = await renderExtensionTemplateAsync('third-party/rag-sillytavern', 'settings');
            $('#extensions_settings').append(settingsHtml);

            addMemoryInput = $('#rag-add-memory-input')[0];
            addMemoryButton = $('#rag-add-memory-button')[0];
            queryInput = $('#rag-query-input')[0];
            queryButton = $('#rag-query-button')[0];
            resultsContainer = $('#rag-results-container')[0];
            statusIndicator = $('#rag-service-status')[0];
            totalMemoriesSpan = $('#rag-total-memories')[0];
            lastQueryTokensSpan = $('#rag-last-query-tokens')[0];
            fastRerankCountInput = $('#rag-fast-rerank-count')[0];
            finalMemoryCountInput = $('#rag-final-memory-count')[0];
            autoMemoryToggle = $('#rag-auto-memory')[0];
            contextIntegrationToggle = $('#rag-context-integration')[0];
            recentMessagesToggle = $('#rag-recent-messages')[0];

            // Load settings
            fastRerankCountInput.value = extension_settings.rag.fast_rerank_count;
            finalMemoryCountInput.value = extension_settings.rag.final_memory_count;
            autoMemoryToggle.checked = extension_settings.rag.auto_memory;
            contextIntegrationToggle.checked = extension_settings.rag.context_integration;
            recentMessagesToggle.checked = extension_settings.rag.recent_messages_enabled;

            // Event listeners
            addMemoryButton.addEventListener('click', handleAddMemory);
            queryButton.addEventListener('click', handleQuery);
            
            // Settings change handlers
            fastRerankCountInput.addEventListener('change', () => {
                extension_settings.rag.fast_rerank_count = parseInt(fastRerankCountInput.value);
                saveMetadataDebounced();
            });
            
            finalMemoryCountInput.addEventListener('change', () => {
                extension_settings.rag.final_memory_count = parseInt(finalMemoryCountInput.value);
                saveMetadataDebounced();
            });
            
            autoMemoryToggle.addEventListener('change', () => {
                extension_settings.rag.auto_memory = autoMemoryToggle.checked;
                saveMetadataDebounced();
            });
            
            contextIntegrationToggle.addEventListener('change', () => {
                extension_settings.rag.context_integration = contextIntegrationToggle.checked;
                saveMetadataDebounced();
            });
            
            recentMessagesToggle.addEventListener('change', () => {
                extension_settings.rag.recent_messages_enabled = recentMessagesToggle.checked;
                saveMetadataDebounced();
            });

            // Periodically check service health and update memory count
            setInterval(updateServiceStatusAndMemories, 10000); // every 10 seconds
            updateServiceStatusAndMemories(); // Initial check and update

            // Hook into SillyTavern events
            setupEventListeners();

            // Add a debug button
            const debugButton = document.createElement('button');
            debugButton.textContent = 'Debug: Add Last Message';
            debugButton.className = 'menu_button';
            debugButton.addEventListener('click', async () => {
                console.log('RAG: Debug button clicked');
                await addLatestMessageToMemory();
                await updateServiceStatusAndMemories();
            });
            document.querySelector('#rag-settings').appendChild(debugButton);

            // Add a sync button for full chat history
            const syncButton = document.createElement('button');
            syncButton.textContent = 'Sync Chat History';
            syncButton.className = 'menu_button';
            syncButton.addEventListener('click', async () => {
                console.log('RAG: Sync button clicked');
                await syncChatHistory();
                await updateServiceStatusAndMemories();
            });
            document.querySelector('#rag-settings').appendChild(syncButton);
        } catch (error) {
            console.error('Error initializing RAG extension UI:', error);
        }
    }

    function setupEventListeners() {
        const context = getContext();
        
        // Auto-add memories when messages are sent or received
        context.eventSource.on(context.eventTypes.MESSAGE_SENT, async (data) => {
            console.log('RAG: MESSAGE_SENT event triggered with data:', data);
            if (extension_settings.rag.auto_memory) {
                console.log('RAG: Auto-memory enabled, adding user message');
                // MESSAGE_SENT often passes a message ID, so we need to get the message by ID
                if (typeof data === 'number' || (typeof data === 'string' && data.match(/^\d+$/))) {
                    await addMessageToMemoryById(data, 'user');
                } else {
                    await addMessageToMemory(data, 'user');
                }
            } else {
                console.log('RAG: Auto-memory disabled, skipping user message');
            }
        });

        context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, async (messageId, type) => {
            console.log('RAG: MESSAGE_RECEIVED event triggered with messageId:', messageId, 'type:', type);
            if (extension_settings.rag.auto_memory) {
                console.log('RAG: Auto-memory enabled, adding assistant message');
                await addMessageToMemoryById(messageId, 'assistant');
            } else {
                console.log('RAG: Auto-memory disabled, skipping assistant message');
            }
        });

        // Additional fallback: Monitor chat changes
        context.eventSource.on(context.eventTypes.CHAT_CHANGED, async () => {
            console.log('RAG: CHAT_CHANGED event triggered');
            if (extension_settings.rag.auto_memory) {
                await addLatestMessageToMemory();
            }
        });

        // Inject context when generation starts
        context.eventSource.on(context.eventTypes.GENERATION_STARTED, async () => {
            if (extension_settings.rag.context_integration) {
                await injectRAGContext();
            }
        });
    }

    async function addMessageToMemory(messageData, messageType) {
        try {
            console.log('RAG: addMessageToMemory called with:', { messageData, messageType });
            
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;
            
            console.log('RAG: Context info:', { characterId, chatId });
            
            if (!characterId || !chatId) {
                console.log('RAG: No character or chat context, skipping auto-memory');
                return;
            }

            // Better handling of message data structure
            let text;
            if (typeof messageData === 'string') {
                text = messageData;
            } else if (typeof messageData === 'number' || (typeof messageData === 'string' && messageData.match(/^\d+$/))) {
                // This is a message ID, get the message content
                console.log('RAG: messageData appears to be an ID, getting message content');
                await addMessageToMemoryById(messageData, messageType);
                return;
            } else if (messageData && typeof messageData === 'object') {
                text = messageData.mes || messageData.message || messageData.text || messageData.content;
            } else {
                console.warn('RAG: Invalid message data structure:', messageData);
                return;
            }

            console.log('RAG: Extracted text:', text);

            // Validate that we have actual text content
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                console.warn('RAG: No valid text content found in message data:', messageData);
                return;
            }

            // Skip if text is just a number or ID (likely not actual message content)
            if (text.match(/^\d+$/)) {
                console.warn('RAG: Skipping what appears to be an ID rather than message text:', text);
                return;
            }
            
            console.log('RAG: Adding memory with params:', {
                text: text.substring(0, 100) + '...',
                character_id: String(characterId),
                chat_id: String(chatId),
                message_type: messageType
            });
            
            const result = await client.addMemory(text, {
                character_id: String(characterId),
                chat_id: String(chatId),
                message_type: messageType
            });

            if (result.error) {
                console.error('RAG: Error adding auto-memory:', result.error);
            } else {
                console.log('RAG: Auto-added memory successfully:', text.substring(0, 50) + '...');
            }
        } catch (error) {
            console.error('RAG: Error in addMessageToMemory:', error);
        }
    }

    async function addMessageToMemoryById(messageId, messageType) {
        try {
            console.log('RAG: addMessageToMemoryById called with messageId:', messageId, 'messageType:', messageType);
            
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;
            
            if (!characterId || !chatId) {
                console.log('RAG: No character or chat context, skipping auto-memory');
                return;
            }

            // Get the current chat
            const chat = context.chat;
            
            if (!chat || !Array.isArray(chat) || messageId >= chat.length) {
                console.warn('RAG: Invalid messageId or chat structure:', messageId, chat?.length);
                return;
            }

            const message = chat[messageId];
            if (!message) {
                console.warn('RAG: No message found at index:', messageId);
                return;
            }

            // Use the specialized chat message endpoint
            const result = await client.addChatMessage(message, {
                character_id: String(characterId),
                chat_id: String(chatId),
                message_type: messageType
            });

            if (result.error) {
                console.error('RAG: Error adding auto-memory by ID:', result.error);
            } else {
                console.log('RAG: Auto-added message by ID successfully:', message.mes?.substring(0, 50) + '...');
            }
        } catch (error) {
            console.error('RAG: Error in addMessageToMemoryById:', error);
        }
    }

    async function addLatestMessageToMemory() {
        try {
            console.log('RAG: addLatestMessageToMemory called');
            
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;
            
            if (!characterId || !chatId) {
                console.log('RAG: No character or chat context, skipping auto-memory');
                return;
            }

            // Get the current chat
            const chat = context.chat;
            
            if (!chat || !Array.isArray(chat) || chat.length === 0) {
                console.warn('RAG: Invalid chat structure or empty chat');
                return;
            }

            // Get the latest message
            const latestMessage = chat[chat.length - 1];
            if (!latestMessage) {
                console.warn('RAG: No latest message found');
                return;
            }

            const messageType = latestMessage.is_user ? 'user' : 'assistant';
            
            // Use the specialized chat message endpoint
            const result = await client.addChatMessage(latestMessage, {
                character_id: String(characterId),
                chat_id: String(chatId),
                message_type: messageType
            });

            if (result.error) {
                console.error('RAG: Error adding latest message to memory:', result.error);
            } else {
                console.log('RAG: Auto-added latest message to memory successfully:', latestMessage.mes?.substring(0, 50) + '...');
            }
        } catch (error) {
            console.error('RAG: Error in addLatestMessageToMemory:', error);
        }
    }

    async function injectRAGContext() {
        try {
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;
            
            if (!characterId || !chatId) {
                console.log('RAG: No character or chat context for injection');
                return;
            }

            // Get recent messages if enabled
            let recentContext = '';
            let recentResult = null;
            if (extension_settings.rag.recent_messages_enabled) {
                recentResult = await client.getRecentMessages(String(characterId), String(chatId));
                if (recentResult.recent_messages && recentResult.recent_messages.length > 0) {
                    recentContext = 'Recent conversation:\n' + 
                        recentResult.recent_messages.map(msg => 
                            `${msg.message_type === 'user' ? context.name1 : context.name2}: ${msg.text}`
                        ).join('\n') + '\n\n';
                }
            }

            // Get relevant memories from the current conversation context
            const lastMessage = context.chat[context.chat.length - 1];
            if (lastMessage && lastMessage.mes) {
                const queryResult = await client.queryMemories(lastMessage.mes, {
                    character_id: String(characterId),
                    chat_id: String(chatId),
                    include_all_chats: false,
                    top_k: -1,  // Always retrieve all memories, then filter by character/chat
                    rerank_fast_top_n: extension_settings.rag.fast_rerank_count,
                    final_top_n: extension_settings.rag.final_memory_count
                });

                if (queryResult.results && queryResult.results.length > 0) {
                    const memoryContext = 'Relevant memories:\n' + 
                        queryResult.results.map(memory => memory.text).join('\n') + '\n\n';
                    
                    const fullContext = recentContext + memoryContext;
                    
                    // Inject into system prompt via extension prompt
                    context.setExtensionPrompt('RAG_MEMORIES', fullContext, 0, 0);
                    
                    console.log(`RAG: Injected ${queryResult.results.length} memories and ${recentResult?.recent_messages?.length || 0} recent messages`);
                }
            }
        } catch (error) {
            console.error('RAG: Error injecting context:', error);
        }
    }

    async function handleAddMemory() {
        const text = addMemoryInput.value.trim();
        if (!text) {
            alert('Please enter text to add as a memory.');
            return;
        }

        const context = getContext();
        const characterId = context.characterId;
        const chatId = context.chatId;

        addMemoryButton.disabled = true;
        const result = await client.addMemory(text, {
            character_id: characterId ? String(characterId) : null,
            chat_id: chatId ? String(chatId) : null,
            message_type: 'user'
        });
        addMemoryButton.disabled = false;

        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addMemoryInput.value = '';
            alert('Memory added successfully!');
            updateServiceStatusAndMemories(); // Refresh count
        }
    }

    async function handleQuery() {
        const text = queryInput.value.trim();
        if (!text) {
            alert('Please enter text to query.');
            return;
        }

        const context = getContext();
        const characterId = context.characterId;
        const chatId = context.chatId;

        queryButton.disabled = true;
        resultsContainer.innerHTML = '<p>Querying...</p>';
        lastQueryTokensSpan.textContent = '0'; // Reset token count

        const rerank_fast_top_n = parseInt(fastRerankCountInput.value, 10);
        const final_top_n = parseInt(finalMemoryCountInput.value, 10);

        const result = await client.queryMemories(text, {
            character_id: characterId ? String(characterId) : null,
            chat_id: chatId ? String(chatId) : null,
            include_all_chats: false,
            top_k: -1,  // Always retrieve all memories, then filter by character/chat
            rerank_fast_top_n: rerank_fast_top_n,
            final_top_n: final_top_n
        });
        queryButton.disabled = false;

        if (result.error) {
            resultsContainer.innerHTML = `<p style="color: red;">Error: ${result.error}</p>`;
        } else {
            displayResults(result.results);
            lastQueryTokensSpan.textContent = result.token_count || '0';
        }
    }

    function displayResults(results) {
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p>No relevant memories found.</p>';
            return;
        }

        const html = results.map(item =>
            `<div class="rag-result-item">${item.text}</div>`
        ).join('');

        resultsContainer.innerHTML = html;
    }

    async function updateServiceStatusAndMemories() {
        try {
            const statusResult = await client.getServiceStatus();
            if (statusResult.error) {
                updateStatus(false);
                totalMemoriesSpan.textContent = 'Error';
            } else {
                updateStatus(true);
                totalMemoriesSpan.textContent = statusResult.total_memories;
            }
        } catch (error) {
            console.error('Error updating service status and memories:', error);
            updateStatus(false);
            totalMemoriesSpan.textContent = 'Error';
        }
    }

    function updateStatus(isConnected) {
        if (isConnected) {
            statusIndicator.classList.remove('rag-status-disconnected');
            statusIndicator.classList.add('rag-status-connected');
        } else {
            statusIndicator.classList.remove('rag-status-connected');
            statusIndicator.classList.add('rag-status-disconnected');
        }
    }
    
    // The 'extensions.settings.load' event is a common pattern in ST extensions.
    // We wait for it to ensure the DOM is ready.
    jQuery(async () => {
        console.log('RAG Extension: Initializing UI...');
        await initializeUI();
        console.log('RAG Extension: UI initialized successfully');
    });

    async function syncChatHistory() {
        try {
            console.log('RAG: syncChatHistory called');
            
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;
            
            if (!characterId || !chatId) {
                console.log('RAG: No character or chat context, skipping sync');
                return;
            }

            // Get the current chat
            const chat = context.chat;
            
            if (!chat || !Array.isArray(chat) || chat.length === 0) {
                console.warn('RAG: Invalid chat structure or empty chat');
                return;
            }

            console.log(`RAG: Syncing ${chat.length} messages from chat history`);
            
            // Prepare messages for batch addition
            const messages = chat.map((message, index) => ({
                text: message.mes || message.message || '',
                character_id: String(characterId),
                chat_id: String(chatId),
                message_type: message.is_user ? 'user' : 'assistant',
                is_user: message.is_user,
                mes: message.mes
            })).filter(msg => msg.text && msg.text.trim().length > 0);

            console.log(`RAG: Filtered to ${messages.length} valid messages`);

            if (messages.length === 0) {
                console.log('RAG: No valid messages to sync');
                return;
            }

            // Add messages in batches to avoid overwhelming the server
            const batchSize = 10;
            const batches = [];
            for (let i = 0; i < messages.length; i += batchSize) {
                batches.push(messages.slice(i, i + batchSize));
            }

            console.log(`RAG: Processing ${batches.length} batches of up to ${batchSize} messages each`);

            let totalProcessed = 0;
            let totalErrors = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`RAG: Processing batch ${i + 1}/${batches.length} with ${batch.length} messages`);
                
                const result = await client.addBatchMemories(batch);
                
                if (result.error) {
                    console.error(`RAG: Error in batch ${i + 1}:`, result.error);
                    totalErrors++;
                } else {
                    totalProcessed += result.processed || 0;
                    if (result.errors && result.errors.length > 0) {
                        console.warn(`RAG: Batch ${i + 1} had ${result.errors.length} errors:`, result.errors);
                        totalErrors += result.errors.length;
                    }
                }
                
                // Small delay between batches to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log(`RAG: Sync completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`);
        } catch (error) {
            console.error('RAG: Error in syncChatHistory:', error);
        }
    }

})();