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

            addMemoryButton.addEventListener('click', handleAddMemory);
            queryButton.addEventListener('click', handleQuery);

            // Periodically check service health and update memory count
            setInterval(updateServiceStatusAndMemories, 10000); // every 10 seconds
            updateServiceStatusAndMemories(); // Initial check and update
        } catch (error) {
            console.error('Error initializing RAG extension UI:', error);
        }
    }

    async function handleAddMemory() {
        const text = addMemoryInput.value.trim();
        if (!text) {
            alert('Please enter text to add as a memory.');
            return;
        }

        addMemoryButton.disabled = true;
        const result = await client.addMemory(text);
        addMemoryButton.disabled = false;

        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addMemoryInput.value = '';
            alert('Memory added successfully!');
        }
    }

    async function handleQuery() {
        const text = queryInput.value.trim();
        if (!text) {
            alert('Please enter text to query.');
            return;
        }

        queryButton.disabled = true;
        resultsContainer.innerHTML = '<p>Querying...</p>';
        lastQueryTokensSpan.textContent = '0'; // Reset token count

        const top_k = parseInt(initialRetrievalCountInput.value, 10);
        const final_top_n = parseInt(finalMemoryCountInput.value, 10);

        const result = await client.queryMemory(text, top_k, final_top_n);
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