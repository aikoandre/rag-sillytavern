// SillyTavern RAG Extension
// Core logic and UI hooks for the RAG extension.

import { getContext, extension_settings, saveMetadataDebounced, renderExtensionTemplateAsync } from '../../../extensions.js';
import { MemoryClient } from './memory_client.js';

(function () {
    const RAG_SERVICE_URL = 'http://127.0.0.1:5000';
    const client = new MemoryClient(RAG_SERVICE_URL);

    // --- UI Elements ---
    let addMemoryInput, addMemoryButton, queryInput, queryButton, resultsContainer, statusIndicator;
    let lastQueryTokensSpan, fastRerankCountInput, finalMemoryCountInput;
    let autoMemoryToggle, contextIntegrationToggle, recentMessagesToggle;
    let currentChatMemoriesSpan, allMemoriesCountSpan;

    // Extension settings
    extension_settings.rag = extension_settings.rag || {
        auto_memory: true,
        context_integration: true,
        recent_messages_enabled: true,
        fast_rerank_count: 100,
        final_memory_count: 10,
        // Intelligent memory selection
        use_intelligent_selection: true,
        min_relevance_score: 0.7,
        max_memories: 8,
        min_memories: 2
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
            lastQueryTokensSpan = $('#rag-last-query-tokens')[0];
            fastRerankCountInput = $('#rag-fast-rerank-count')[0];
            finalMemoryCountInput = $('#rag-final-memory-count')[0];
            autoMemoryToggle = $('#rag-auto-memory')[0];
            contextIntegrationToggle = $('#rag-context-integration')[0];
            recentMessagesToggle = $('#rag-recent-messages')[0];
            currentChatMemoriesSpan = $('#rag-current-chat-memories')[0];
            allMemoriesCountSpan = $('#rag-all-memories-count')[0];

            // Get debug and utility buttons
            const debugButton = $('#rag-debug-button')[0];
            const syncButton = $('#rag-sync-button')[0];
            
            // Get memory management buttons
            const deleteChatMemoriesButton = $('#rag-delete-chat-memories')[0];
            const deleteAllMemoriesButton = $('#rag-delete-all-memories')[0];

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

            // Set up debug and utility button event listeners
            debugButton.addEventListener('click', async () => {
                console.log('RAG: Debug button clicked');
                await addLatestMessageToMemory();
                await updateServiceStatusAndMemories();
                await updateMemoryCounts();
            });

            syncButton.addEventListener('click', async () => {
                console.log('RAG: Sync button clicked');
                await syncChatHistory();
                await updateServiceStatusAndMemories();
                await updateMemoryCounts();
            });

            // Memory management event listeners
            deleteChatMemoriesButton.addEventListener('click', async () => {
                const context = getContext();
                const characterId = context.characterId;
                const chatId = context.chatId;
                
                if (!characterId || !chatId) {
                    alert('No current chat to delete memories from.');
                    return;
                }
                
                if (confirm(`Are you sure you want to delete all memories from this chat?\n\nCharacter: ${characterId}\nChat: ${chatId}\n\nThis action cannot be undone.`)) {
                    console.log('RAG: Deleting current chat memories');
                    deleteChatMemoriesButton.disabled = true;
                    
                    const result = await client.deleteMemories(String(characterId), String(chatId));
                    
                    deleteChatMemoriesButton.disabled = false;
                    
                    if (result.error) {
                        alert(`Error: ${result.error}`);
                    } else {
                        alert(`Deleted ${result.deleted} memories from current chat.`);
                        // Add a small delay to ensure backend has finished saving
                        setTimeout(async () => {
                            await updateServiceStatusAndMemories();
                            await updateMemoryCounts();
                        }, 500);
                    }
                }
            });

            deleteAllMemoriesButton.addEventListener('click', async () => {
                if (confirm('⚠️ WARNING ⚠️\n\nAre you absolutely sure you want to delete ALL memories from ALL chats?\n\nThis will permanently delete EVERYTHING and cannot be undone!\n\nType "DELETE ALL" in the next prompt to confirm.')) {
                    const confirmation = prompt('Please type "DELETE ALL" to confirm deletion of all memories:');
                    if (confirmation === 'DELETE ALL') {
                        console.log('RAG: Deleting all memories');
                        deleteAllMemoriesButton.disabled = true;
                        
                        const result = await client.deleteMemories();
                        console.log('RAG: Delete all memories result:', result);
                        
                        deleteAllMemoriesButton.disabled = false;
                        
                        if (result.error) {
                            alert(`Error: ${result.error}`);
                        } else {
                            alert(`Deleted ${result.deleted} memories from ALL chats.`);
                            console.log('RAG: Calling updateServiceStatusAndMemories after delete all');
                            // Add a small delay to ensure backend has finished saving
                            setTimeout(async () => {
                                await updateServiceStatusAndMemories();
                                console.log('RAG: Calling updateMemoryCounts after delete all');
                                await updateMemoryCounts();
                            }, 500);
                        }
                    } else {
                        alert('Deletion cancelled. You must type "DELETE ALL" exactly to confirm.');
                    }
                }
            });

            // Update memory counts every 5 seconds
            setInterval(updateMemoryCounts, 5000);
            updateMemoryCounts(); // Initial update
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
                const queryParams = {
                    character_id: String(characterId),
                    chat_id: String(chatId),
                    include_all_chats: false,
                    top_k: -1,  // Always retrieve all memories, then filter by character/chat
                    rerank_fast_top_n: extension_settings.rag.fast_rerank_count,
                    final_top_n: extension_settings.rag.final_memory_count
                };

                // Add intelligent selection parameters if enabled
                if (extension_settings.rag.use_intelligent_selection) {
                    queryParams.min_relevance_score = extension_settings.rag.min_relevance_score;
                    queryParams.max_memories = extension_settings.rag.max_memories;
                    queryParams.min_memories = extension_settings.rag.min_memories;
                }

                const queryResult = await client.queryMemories(lastMessage.mes, queryParams);

                if (queryResult.results && queryResult.results.length > 0) {
                    const memoryContext = 'Relevant memories:\n' + 
                        queryResult.results.map(memory => memory.text).join('\n') + '\n\n';
                    
                    const fullContext = recentContext + memoryContext;
                    
                    // Inject into system prompt via extension prompt
                    context.setExtensionPrompt('RAG_MEMORIES', fullContext, 0, 0);
                    
                    console.log(`RAG: Injected ${queryResult.results.length} memories and ${recentResult?.recent_messages?.length || 0} recent messages`);
                    console.log('RAG: Full injected context:', fullContext);
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
            updateMemoryCounts(); // Update specific memory counts
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

        const queryParams = {
            character_id: characterId ? String(characterId) : null,
            chat_id: chatId ? String(chatId) : null,
            include_all_chats: false,
            top_k: -1,  // Always retrieve all memories, then filter by character/chat
            rerank_fast_top_n: rerank_fast_top_n,
            final_top_n: final_top_n
        };

        // Add intelligent selection parameters if enabled
        if (extension_settings.rag.use_intelligent_selection) {
            queryParams.min_relevance_score = extension_settings.rag.min_relevance_score;
            queryParams.max_memories = extension_settings.rag.max_memories;
            queryParams.min_memories = extension_settings.rag.min_memories;
        }

        const result = await client.queryMemories(text, queryParams);
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
            } else {
                updateStatus(true);
            }
        } catch (error) {
            console.error('Error updating service status:', error);
            updateStatus(false);
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

    async function updateMemoryCounts() {
        try {
            console.log('RAG: updateMemoryCounts called');
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;

            // Update all memories count
            try {
                console.log('RAG: Fetching all memories count...');
                const allMemoriesResult = await client.getMemories(null, null, null);
                console.log('RAG: All memories result:', allMemoriesResult);
                if (allMemoriesResult.error) {
                    console.error('RAG: Error in all memories result:', allMemoriesResult.error);
                    allMemoriesCountSpan.textContent = 'Error';
                } else {
                    const count = allMemoriesResult.total || 0;
                    console.log('RAG: Setting all memories count to:', count);
                    allMemoriesCountSpan.textContent = count;
                }
            } catch (error) {
                console.error('Error getting all memories count:', error);
                allMemoriesCountSpan.textContent = 'Error';
            }

            // Update current chat memories count
            try {
                if (characterId && chatId) {
                    console.log('RAG: Fetching current chat memories count for:', characterId, chatId);
                    const chatMemoriesResult = await client.getMemories(String(characterId), String(chatId), null);
                    console.log('RAG: Current chat memories result:', chatMemoriesResult);
                    if (chatMemoriesResult.error) {
                        console.error('RAG: Error in current chat memories result:', chatMemoriesResult.error);
                        currentChatMemoriesSpan.textContent = 'Error';
                    } else {
                        const count = chatMemoriesResult.total || 0;
                        console.log('RAG: Setting current chat memories count to:', count);
                        currentChatMemoriesSpan.textContent = count;
                    }
                } else {
                    console.log('RAG: No character or chat ID, setting current chat memories to N/A');
                    currentChatMemoriesSpan.textContent = 'N/A';
                }
            } catch (error) {
                console.error('Error getting current chat memories count:', error);
                currentChatMemoriesSpan.textContent = 'Error';
            }
        } catch (error) {
            console.error('Error updating memory counts:', error);
            allMemoriesCountSpan.textContent = 'Error';
            currentChatMemoriesSpan.textContent = 'Error';
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