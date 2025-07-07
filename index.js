// SillyTavern RAG Extension
// Core logic and UI hooks for the RAG extension.

import { getContext, extension_settings, saveMetadataDebounced, renderExtensionTemplateAsync } from '../../../extensions.js';
import { MemoryClient } from './memory_client.js';

(function () {
    const RAG_SERVICE_URL = 'http://127.0.0.1:5000';
    const client = new MemoryClient(RAG_SERVICE_URL);

    // --- UI Elements ---
    let addMemoryInput, addMemoryButton, queryInput, queryButton, resultsContainer, statusIndicator;
    let totalMemoriesSpan, lastQueryTokensSpan, initialRetrievalCountInput, finalMemoryCountInput;
    let autoMemoryToggle, contextIntegrationToggle, recentMessagesToggle;

    // Extension settings
    extension_settings.rag = extension_settings.rag || {
        auto_memory: true,
        context_integration: true,
        recent_messages_enabled: true,
        initial_retrieval_count: 100,
        final_memory_count: 10
    };

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
            initialRetrievalCountInput = $('#rag-initial-retrieval-count')[0];
            finalMemoryCountInput = $('#rag-final-memory-count')[0];
            autoMemoryToggle = $('#rag-auto-memory')[0];
            contextIntegrationToggle = $('#rag-context-integration')[0];
            recentMessagesToggle = $('#rag-recent-messages')[0];

            // Load settings
            initialRetrievalCountInput.value = extension_settings.rag.initial_retrieval_count;
            finalMemoryCountInput.value = extension_settings.rag.final_memory_count;
            autoMemoryToggle.checked = extension_settings.rag.auto_memory;
            contextIntegrationToggle.checked = extension_settings.rag.context_integration;
            recentMessagesToggle.checked = extension_settings.rag.recent_messages_enabled;

            // Event listeners
            addMemoryButton.addEventListener('click', handleAddMemory);
            queryButton.addEventListener('click', handleQuery);
            
            // Settings change handlers
            initialRetrievalCountInput.addEventListener('change', () => {
                extension_settings.rag.initial_retrieval_count = parseInt(initialRetrievalCountInput.value);
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
        } catch (error) {
            console.error('Error initializing RAG extension UI:', error);
        }
    }

    function setupEventListeners() {
        const context = getContext();
        
        // Auto-add memories when messages are sent or received
        context.eventSource.on(context.eventTypes.MESSAGE_SENT, async (data) => {
            if (extension_settings.rag.auto_memory) {
                await addMessageToMemory(data, 'user');
            }
        });

        context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, async (data) => {
            if (extension_settings.rag.auto_memory) {
                await addMessageToMemory(data, 'assistant');
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
            const context = getContext();
            const characterId = context.characterId;
            const chatId = context.chatId;
            
            if (!characterId || !chatId) {
                console.log('RAG: No character or chat context, skipping auto-memory');
                return;
            }

            const text = messageData.mes || messageData.message || messageData;
            
            const result = await client.addMemory(text, {
                character_id: String(characterId),
                chat_id: String(chatId),
                message_type: messageType
            });

            if (result.error) {
                console.error('RAG: Error adding auto-memory:', result.error);
            } else {
                console.log('RAG: Auto-added memory:', text.substring(0, 50) + '...');
            }
        } catch (error) {
            console.error('RAG: Error in addMessageToMemory:', error);
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
                    top_k: extension_settings.rag.initial_retrieval_count,
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

        const top_k = parseInt(initialRetrievalCountInput.value, 10);
        const final_top_n = parseInt(finalMemoryCountInput.value, 10);

        const result = await client.queryMemories(text, {
            character_id: characterId ? String(characterId) : null,
            chat_id: chatId ? String(chatId) : null,
            include_all_chats: false,
            top_k: top_k,
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

})();