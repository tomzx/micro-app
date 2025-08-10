class AIService {
    constructor() {
        this.isGeneratingFeedback = false;
        this.hasPendingFeedbackRequest = false;
        this.feedbackTimer = null;
        this.activeRequests = new Map(); // Track individual request timers
        
        // Individual prompt timers for different trigger types
        this.promptTimers = new Map(); // Track individual prompt timers
        this.lastTriggerContent = new Map(); // Track last content that triggered each prompt
        this.pendingContent = new Map(); // Track content that is currently scheduled
        this.promptTimerInfo = new Map(); // Track timer start time and duration for countdown display
        this.countdownCallbacks = new Map(); // Track countdown update callbacks
    }


    async getPromptFeedback(content, promptName, promptText) {
        try {
            const response = await fetch('/analyze-prompt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: content,
                    prompt_name: promptName,
                    prompt_text: promptText
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            // Backend now returns HTML directly
            const htmlContent = await response.text();
            
            return {
                htmlContent: htmlContent,
                promptName: promptName,
                responseType: 'html'
            };
        } catch (error) {
            console.error(`Error calling prompt API for '${promptName}':`, error);
            // Return error as HTML format too for consistency
            const errorHtml = `
                <div class="feedback-item">
                    <h4>❌ ${promptName} - Connection Error</h4>
                    <div class="category-section">
                        <h5>Connection Error</h5>
                        <p class="feedback-high">
                            • Unable to connect to AI service. Please check your internet connection.
                            <span class="priority-badge high">high</span>
                        </p>
                    </div>
                </div>
            `;
            return {
                htmlContent: errorHtml,
                promptName: promptName,
                responseType: 'error'
            };
        }
    }

    convertGenericItemsToFeedback(items, responseType) {
        if (!items || !Array.isArray(items)) {
            return [];
        }

        return items.map(item => {
            switch (item.type) {
                case 'recommendation':
                case 'feedback':
                    return {
                        category: item.content.category || 'Analysis',
                        suggestion: item.content.suggestion || '',
                        priority: item.content.priority || 'medium',
                        type: 'feedback'
                    };
                
                case 'citation':
                case 'reference':
                    const citationFormatted = this.formatCitation(item.content);
                    return {
                        category: 'References',
                        suggestion: citationFormatted.text,
                        priority: 'medium',
                        type: 'citation',
                        htmlContent: citationFormatted.html,
                        originalContent: item.content
                    };
                
                case 'diff':
                    const diffFormatted = this.formatDiff(item.content);
                    return {
                        category: 'Suggested Edits',
                        suggestion: diffFormatted.text,
                        priority: 'high',
                        type: 'diff',
                        htmlContent: diffFormatted.html,
                        originalContent: item.content
                    };
                
                case 'analysis':
                case 'insight':
                    return {
                        category: item.content.title || 'Analysis',
                        suggestion: item.content.description || JSON.stringify(item.content),
                        priority: 'medium',
                        type: 'analysis'
                    };
                
                default:
                    return {
                        category: item.type?.charAt(0).toUpperCase() + item.type?.slice(1) || 'Analysis',
                        suggestion: typeof item.content === 'string' ? item.content : JSON.stringify(item.content),
                        priority: 'medium',
                        type: 'general'
                    };
            }
        });
    }

    formatCitation(content) {
        // Create a structured citation display
        return {
            html: this.createCitationHTML(content),
            text: this.createCitationText(content)
        };
    }

    formatDiff(content) {
        // Create a structured diff display
        return {
            html: this.createDiffHTML(content),
            text: this.createDiffText(content)
        };
    }

    createCitationHTML(content) {
        const fields = [];
        
        if (content.source) {
            fields.push(`
                <div class="citation-field">
                    <span class="field-label">Source</span>
                    <span class="field-value">${this.escapeHTML(content.source)}</span>
                </div>
            `);
        }
        
        if (content.title) {
            fields.push(`
                <div class="citation-field">
                    <span class="field-label">Title</span>
                    <span class="field-value">${this.escapeHTML(content.title)}</span>
                </div>
            `);
        }
        
        if (content.url) {
            fields.push(`
                <div class="citation-field">
                    <span class="field-label">URL</span>
                    <span class="field-value link" onclick="window.open('${this.escapeHTML(content.url)}', '_blank')">${this.escapeHTML(content.url)}</span>
                </div>
            `);
        }
        
        if (content.relevance) {
            fields.push(`
                <div class="citation-field">
                    <span class="field-label">Relevance</span>
                    <span class="field-value">${this.escapeHTML(content.relevance)}</span>
                </div>
            `);
        }

        return `
            <div class="citation-content">
                ${fields.join('')}
            </div>
        `;
    }

    createDiffHTML(content) {
        let html = '<div class="diff-content">';
        
        if (content.original) {
            html += `
                <div class="diff-section">
                    <div class="diff-text original" data-label="Original">
                        ${this.escapeHTML(content.original)}
                    </div>
                </div>
            `;
        }
        
        if (content.suggested) {
            html += `
                <div class="diff-section">
                    <div class="diff-text suggested" data-label="Suggested">
                        ${this.escapeHTML(content.suggested)}
                    </div>
                </div>
            `;
        }
        
        if (content.reason) {
            html += `
                <div class="diff-reason">
                    ${this.escapeHTML(content.reason)}
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    createCitationText(content) {
        const parts = [];
        if (content.source) parts.push(`Source: ${content.source}`);
        if (content.title) parts.push(`Title: ${content.title}`);
        if (content.url) parts.push(`URL: ${content.url}`);
        if (content.relevance) parts.push(`Relevance: ${content.relevance}`);
        return parts.join('\n');
    }

    createDiffText(content) {
        const parts = [];
        if (content.original) parts.push(`Original: "${content.original}"`);
        if (content.suggested) parts.push(`Suggested: "${content.suggested}"`);
        if (content.reason) parts.push(`Reason: ${content.reason}`);
        return parts.join('\n');
    }

    escapeHTML(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }


    scheduleFeedback(callback, delay = 1000) {
        clearTimeout(this.feedbackTimer);

        if (this.isGeneratingFeedback) {
            this.hasPendingFeedbackRequest = true;
            return;
        }

        this.feedbackTimer = setTimeout(() => {
            callback();
        }, delay);
    }

    schedulePromptFeedback(promptId, callback, triggerTiming = 'delay', content = '', customDelay = '') {
        const timerId = `prompt-${promptId}`;
        
        // Check if content has changed from last processed content
        const lastContent = this.lastTriggerContent.get(promptId);
        const pendingContent = this.pendingContent.get(promptId);
        
        if (lastContent === content || pendingContent === content) {
            return; // Same content already processed or scheduled
        }
        
        // Track that this content is now pending
        this.pendingContent.set(promptId, content);

        // Clear existing timer for this prompt only after content change is confirmed
        if (this.promptTimers.has(timerId)) {
            clearTimeout(this.promptTimers.get(timerId));
            this.promptTimers.delete(timerId);
        }
        
        // Clear existing countdown for this prompt
        this.clearCountdownInterval(promptId);

        let delay = 0;
        switch (triggerTiming) {
            case 'word':
            case 'sentence':
                delay = 100; // Small delay to batch rapid completions
                break;
            case 'custom':
            default:
                delay = this.parseCustomDelay(customDelay);
                if (delay === null) delay = 1000; // Fallback to 1 second if invalid
                break;
        }

        const startTime = Date.now();
        const timer = setTimeout(() => {
            // Store content when timer actually completes and clear pending
            this.lastTriggerContent.set(promptId, content);
            this.pendingContent.delete(promptId);
            callback(promptId);
            this.promptTimers.delete(timerId);
            this.promptTimerInfo.delete(promptId);
            this.clearCountdownInterval(promptId);
        }, delay);

        this.promptTimers.set(timerId, timer);
        
        // Store timer info for countdown display (only for custom delays > 1 second)
        if (triggerTiming === 'custom' && delay > 1000) {
            // Check if there are existing feedback containers for this prompt
            const prompt = window.app?.promptsManager?.getPrompt?.(promptId);
            if (prompt) {
                const existingContainers = this.findAllFeedbackContainersByName(prompt.name);
                if (existingContainers.length > 0) {
                    this.promptTimerInfo.set(promptId, {
                        startTime,
                        duration: delay,
                        triggerTiming,
                        customDelay
                    });
                    
                    // Start countdown display only if there are existing containers
                    this.startCountdownDisplay(promptId);
                }
            }
        }
    }

    parseCustomDelay(delayString) {
        if (!delayString) return null;
        
        // Parse format: Ad Bh Cm Ds (days, hours, minutes, seconds)
        const regex = /(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i;
        const match = delayString.trim().match(regex);
        
        if (!match || match[0] === '') return null;
        
        const days = parseInt(match[1] || 0);
        const hours = parseInt(match[2] || 0);
        const minutes = parseInt(match[3] || 0);
        const seconds = parseInt(match[4] || 0);
        
        // Check if at least one unit was specified
        if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
            return null;
        }
        
        // Convert to milliseconds
        const totalMs = (days * 24 * 60 * 60 * 1000) + 
                       (hours * 60 * 60 * 1000) + 
                       (minutes * 60 * 1000) + 
                       (seconds * 1000);
        
        return totalMs > 0 ? totalMs : null;
    }

    clearPromptTimer(promptId) {
        const timerId = `prompt-${promptId}`;
        if (this.promptTimers.has(timerId)) {
            clearTimeout(this.promptTimers.get(timerId));
            this.promptTimers.delete(timerId);
        }
        this.promptTimerInfo.delete(promptId);
        this.pendingContent.delete(promptId);
        this.clearCountdownInterval(promptId);
    }

    startCountdownDisplay(promptId) {
        // Clear any existing countdown interval
        this.clearCountdownInterval(promptId);
        
        const updateCountdown = () => {
            const timerInfo = this.promptTimerInfo.get(promptId);
            if (!timerInfo) return;
            
            const elapsed = Date.now() - timerInfo.startTime;
            const remaining = Math.max(0, timerInfo.duration - elapsed);
            
            if (remaining <= 0) {
                this.clearCountdownInterval(promptId);
                return;
            }
            
            // Format remaining time
            const remainingSeconds = Math.ceil(remaining / 1000);
            const countdownText = this.formatCountdownTime(remainingSeconds);
            
            // Update the countdown display in the UI
            this.updateCountdownDisplay(promptId, countdownText);
        };
        
        // Update immediately, then every 100ms for smooth countdown
        updateCountdown();
        const interval = setInterval(updateCountdown, 100);
        this.countdownCallbacks.set(promptId, interval);
    }

    clearCountdownInterval(promptId) {
        const interval = this.countdownCallbacks.get(promptId);
        if (interval) {
            clearInterval(interval);
            this.countdownCallbacks.delete(promptId);
        }
        // Remove countdown display from UI
        this.removeCountdownDisplay(promptId);
    }

    formatCountdownTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            let result = `${hours}h`;
            if (mins > 0) result += ` ${mins}m`;
            if (secs > 0) result += ` ${secs}s`;
            return result;
        }
    }

    updateCountdownDisplay(promptId, countdownText) {
        // Find existing feedback containers by prompt name
        const prompt = window.app?.promptsManager?.getPrompt?.(promptId);
        if (!prompt) {
            return;
        }
        
        const existingContainers = this.findAllFeedbackContainersByName(prompt.name);
        
        if (existingContainers.length === 0) {
            return;
        }
        
        // Add countdown to all containers for this prompt
        existingContainers.forEach(container => {
            // Find or create countdown element
            let countdownElement = container.querySelector('.countdown-timer');
            if (!countdownElement) {
                countdownElement = document.createElement('div');
                countdownElement.className = 'countdown-timer';
                
                // Insert after the heading
                const heading = container.querySelector('h4');
                if (heading) {
                    heading.insertAdjacentElement('afterend', countdownElement);
                } else {
                    // If no heading, just append to container
                    container.appendChild(countdownElement);
                }
            }
            
            countdownElement.textContent = `🔄 Updating in ${countdownText}`;
        });
    }


    removeCountdownDisplay(promptId) {
        // Get prompt name to find all related containers
        const prompt = window.app?.promptsManager?.getPrompt?.(promptId);
        if (!prompt) {
            return;
        }
        
        // Find all feedback containers for this prompt
        const containers = this.findAllFeedbackContainersByName(prompt.name);
        
        containers.forEach(container => {
            const countdownElement = container.querySelector('.countdown-timer');
            if (countdownElement) {
                countdownElement.remove();
            }
        });
        
        // Also remove any temporary countdown containers (legacy cleanup)
        const countdownContainer = document.getElementById(`countdown-${promptId}`);
        if (countdownContainer) {
            countdownContainer.remove();
        }
    }

    findExistingFeedbackContainer(promptId) {
        // Try to find by prompt ID in the individual request containers
        const individualContainer = document.getElementById(`placeholder-individual-${promptId}`);
        if (individualContainer) return individualContainer;
        
        // Try to find any existing feedback container for this prompt
        const prompt = window.app?.promptsManager?.getPrompt?.(promptId);
        if (prompt) {
            return this.findExistingFeedbackContainerByName(prompt.name);
        }
        
        return null;
    }

    findExistingFeedbackContainerByName(promptName) {
        const container = document.getElementById('feedbackContainer');
        if (!container) return null;
        
        // Look for a container with this prompt name in its heading
        const containers = container.querySelectorAll('.feedback-item');
        for (const cont of containers) {
            const heading = cont.querySelector('h4');
            if (heading && heading.textContent.includes(promptName)) {
                return cont;
            }
        }
        return null;
    }

    findAllFeedbackContainersByName(promptName) {
        const container = document.getElementById('feedbackContainer');
        if (!container) return [];
        
        // Find all containers with this prompt name in their heading
        const matchingContainers = [];
        const containers = container.querySelectorAll('.feedback-item');
        
        containers.forEach(cont => {
            const heading = cont.querySelector('h4');
            if (heading && heading.textContent.includes(promptName)) {
                matchingContainers.push(cont);
            }
        });
        
        return matchingContainers;
    }

    async generateFeedback(content, onLoading, onProgressiveComplete, onError, prompts = [], settings = {}) {
        if (content.length < 10) return;

        if (this.isGeneratingFeedback) {
            this.hasPendingFeedbackRequest = true;
            return;
        }

        this.isGeneratingFeedback = true;
        this.hasPendingFeedbackRequest = false;

        onLoading(true);

        // Check if AI feedback is disabled
        if (!settings.enableAIFeedback) {
            try {
                // Clear initial placeholder
                const initialPlaceholder = document.getElementById('initialPlaceholder');
                if (initialPlaceholder) {
                    initialPlaceholder.remove();
                }
                
                const disabledHtml = `
                    <div class="feedback-item">
                        <h4>🔇 AI Feedback Disabled</h4>
                        <div class="category-section">
                            <h5>AI Feedback Disabled</h5>
                            <p class="feedback-low">
                                • AI feedback is currently disabled in settings. Enable it in the Settings tab to get AI-powered writing suggestions.
                                <span class="priority-badge low">low</span>
                            </p>
                        </div>
                    </div>
                `;
                const disabledFeedback = [{
                    promptName: 'AI Feedback Disabled',
                    htmlContent: disabledHtml
                }];

                onProgressiveComplete({
                    groupedFeedback: disabledFeedback,
                    isComplete: true,
                    completedCount: 1,
                    totalCount: 1
                });

            } finally {
                onLoading(false);
                this.isGeneratingFeedback = false;

                if (this.hasPendingFeedbackRequest) {
                    this.hasPendingFeedbackRequest = false;
                    setTimeout(() => {
                        this.generateFeedback(content, onLoading, onProgressiveComplete, onError, prompts, settings);
                    }, 100);
                }
            }
            return;
        }

        try {
            // Clear any existing loading placeholders but preserve completed feedback
            this.clearOnlyLoadingPlaceholders();
            const initialPlaceholder = document.getElementById('initialPlaceholder');
            if (initialPlaceholder) {
                initialPlaceholder.remove();
            }
            
            // Only use enabled prompts
            const enabledPrompts = prompts.filter(prompt => prompt.enabled);
            
            // If no prompts are enabled, show a message
            if (enabledPrompts.length === 0) {
                const noPromptsHtml = `
                    <div class="feedback-item">
                        <h4>📝 No Prompts</h4>
                        <div class="category-section">
                            <h5>Setup Required</h5>
                            <p class="feedback-low">
                                • No prompts are enabled. Go to the Prompts tab to create and enable prompts for AI analysis.
                                <span class="priority-badge low">low</span>
                            </p>
                        </div>
                    </div>
                `;
                const noPromptsFeedback = [{
                    promptName: 'No Prompts',
                    htmlContent: noPromptsHtml
                }];

                onProgressiveComplete({
                    groupedFeedback: noPromptsFeedback,
                    isComplete: true,
                    completedCount: 1,
                    totalCount: 1
                });
                return;
            }
            
            // Show update indicators for existing feedback that will be refreshed
            this.showUpdateIndicatorsForExistingFeedback(enabledPrompts.map(p => p.name));

            // Create promises and placeholders for all prompts
            const allPromises = enabledPrompts.map(prompt => {
                const requestId = `prompt-${prompt.id}`;
                this.createOrUpdateRequestContainer(requestId, prompt.name, true);
                return this.getPromptFeedback(content, prompt.name, prompt.prompt)
                    .then(result => ({ ...result, promptId: prompt.id, requestId }));
            });

            // Process results as they complete
            let completedCount = 0;
            const groupedFeedback = [];

            // Wait for each promise and update UI progressively
            for (const promise of allPromises) {
                try {
                    const result = await promise;

                    // Replace the placeholder for this completed request with HTML content
                    if (result.requestId) {
                        const promptName = result.promptName || 'General';
                        this.replaceRequestPlaceholderWithHTML(result.requestId, result.htmlContent, promptName);
                    }

                    // Add feedback grouped by prompt (for final completion callback)
                    const promptName = result.promptName || 'General';
                    groupedFeedback.push({
                        promptName: promptName,
                        htmlContent: result.htmlContent
                    });
                    completedCount++;

                    // Only send completion signal when all are done
                    if (completedCount === allPromises.length) {
                        onProgressiveComplete({
                            groupedFeedback: [...groupedFeedback],
                            isComplete: true,
                            completedCount,
                            totalCount: allPromises.length
                        });
                    }

                } catch (error) {
                    console.error('Error with individual prompt:', error);
                    
                    // For errors, we'll handle cleanup at the end since we can't identify which request failed
                    completedCount++;

                    // Add error feedback group for final callback
                    const errorHtml = `
                        <div class="feedback-item">
                            <h4>❌ Error</h4>
                            <div class="category-section">
                                <h5>Error</h5>
                                <p class="feedback-low">
                                    • One of the analysis requests failed. Please try again.
                                    <span class="priority-badge low">low</span>
                                </p>
                            </div>
                        </div>
                    `;
                    groupedFeedback.push({
                        promptName: 'Error',
                        htmlContent: errorHtml
                    });

                    // Send completion signal when all are done (including failed ones)
                    if (completedCount === allPromises.length) {
                        onProgressiveComplete({
                            groupedFeedback: [...groupedFeedback],
                            isComplete: true,
                            completedCount,
                            totalCount: allPromises.length
                        });
                    }
                }
            }

        } catch (error) {
            console.error('Error generating AI feedback:', error);
            onError('Unable to generate feedback. Please check your connection.');
        } finally {
            onLoading(false);
            // Clean up any remaining placeholders
            this.clearAllRequestPlaceholders();
            this.isGeneratingFeedback = false;

            if (this.hasPendingFeedbackRequest) {
                this.hasPendingFeedbackRequest = false;
                setTimeout(() => {
                    this.generateFeedback(content, onLoading, onProgressiveComplete, onError, prompts, settings);
                }, 100);
            }
        }
    }


    getCategoryIcon(category) {
        const icons = {
            'Style': '✨',
            'Grammar': '📝',
            'Vocabulary': '📚',
            'Structure': '🏗️',
            'Clarity': '💡',
            'Syntax': '⚙️',
            'Connection Error': '⚠️',
            'AI Analysis': '🤖',
            'References': '📚',
            'Suggested Edits': '✏️',
            'Analysis': '🔍',
            'Citations': '📖',
            'Diffs': '📝',
            'Insights': '💡'
        };
        return icons[category] || '📋';
    }

    createRequestPlaceholder(requestId, promptName) {
        const container = document.getElementById('feedbackContainer');
        const placeholder = document.createElement('div');
        placeholder.className = 'feedback-item loading-item';
        placeholder.id = `placeholder-${requestId}`;
        placeholder.innerHTML = `
            <h4>🔄 ${promptName}</h4>
            <p>
                <span class="loading-timer" id="timer-${requestId}">0.0s</span>
                <span class="loading-text">Analyzing...</span>
            </p>
        `;
        
        // Append at the end of the container to maintain order
        container.appendChild(placeholder);
        
        // Start timer for this request
        const startTime = Date.now();
        const timerInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const timerElement = document.getElementById(`timer-${requestId}`);
            if (timerElement) {
                timerElement.textContent = elapsed.toFixed(1) + 's';
            }
        }, 100);
        
        this.activeRequests.set(requestId, {
            startTime,
            timerInterval,
            promptName
        });
        
        return placeholder;
    }

    replaceRequestPlaceholderWithHTML(requestId, htmlContent, promptName) {
        const placeholder = document.getElementById(`placeholder-${requestId}`);
        if (!placeholder) return;
        
        // Stop and clear the timer
        const request = this.activeRequests.get(requestId);
        if (request && request.timerInterval) {
            clearInterval(request.timerInterval);
        }
        this.activeRequests.delete(requestId);
        
        // Clear any countdown display for this prompt
        if (requestId.startsWith('individual-')) {
            const promptId = requestId.replace('individual-', '');
            this.clearCountdownInterval(promptId);
        }
        
        // Simply replace the entire placeholder with the HTML content
        placeholder.outerHTML = htmlContent;
    }

    replaceRequestPlaceholder(requestId, feedback, promptName) {
        const placeholder = document.getElementById(`placeholder-${requestId}`);
        if (!placeholder) return;
        
        // Stop and clear the timer
        const request = this.activeRequests.get(requestId);
        if (request && request.timerInterval) {
            clearInterval(request.timerInterval);
        }
        
        // Check if this was an existing container converted to loading state
        const wasExistingContainer = request && request.existingContainer;
        
        this.activeRequests.delete(requestId);
        
        // Create the new feedback content
        if (feedback && feedback.length > 0) {
            const groupedFeedback = {};
            feedback.forEach(item => {
                if (!groupedFeedback[item.category]) {
                    groupedFeedback[item.category] = [];
                }
                groupedFeedback[item.category].push(item);
            });

            let html = '';
            
            if (wasExistingContainer) {
                // Update the existing container in place
                placeholder.classList.remove('loading-item');
                placeholder.id = ''; // Remove the placeholder ID
                
                // Update the heading
                const heading = placeholder.querySelector('h4');
                if (heading) {
                    heading.innerHTML = `✨ ${promptName}`;
                }
                
                // Replace the content but keep the container
                let contentHtml = '';
                for (const [category, items] of Object.entries(groupedFeedback)) {
                    contentHtml += `<div class="category-section">
                        <h5>${category}</h5>`;
                    
                    items.forEach(item => {
                        // Use specialized display for citations and diffs
                        if (item.type === 'citation') {
                            contentHtml += `
                                <div class="citation-item">
                                    <div class="citation-header">
                                        <span class="citation-icon">📚</span>
                                        <h6 class="citation-title">Citation</h6>
                                    </div>
                                    ${item.htmlContent}
                                    <span class="priority-badge citation">${item.priority}</span>
                                </div>
                            `;
                        } else if (item.type === 'diff') {
                            contentHtml += `
                                <div class="diff-item">
                                    <div class="diff-header">
                                        <span class="diff-icon">✏️</span>
                                        <h6 class="diff-title">Suggested Edit</h6>
                                    </div>
                                    ${item.htmlContent}
                                    <span class="priority-badge diff">${item.priority}</span>
                                </div>
                            `;
                        } else {
                            // Standard feedback display
                            const priorityClass = item.type || item.priority;
                            contentHtml += `
                                <p class="feedback-${item.priority}">
                                    • ${this.escapeHTML(item.suggestion)}
                                    <span class="priority-badge ${priorityClass}">${item.priority}</span>
                                </p>
                            `;
                        }
                    });
                    
                    contentHtml += `</div>`;
                }
                
                // Remove all content except the heading and add new content
                const elementsToRemove = placeholder.querySelectorAll('.category-section, p:not(.loading-text)');
                elementsToRemove.forEach(el => el.remove());
                
                // Remove any loading text
                const loadingText = placeholder.querySelector('.loading-text');
                if (loadingText && loadingText.parentElement) {
                    loadingText.parentElement.remove();
                }
                
                placeholder.insertAdjacentHTML('beforeend', contentHtml);
                
            } else {
                // Replace entire placeholder as before
                html = `<div class="feedback-item">
                    <h4>✨ ${promptName}</h4>`;
                
                for (const [category, items] of Object.entries(groupedFeedback)) {
                    html += `<div class="category-section">
                        <h5>${category}</h5>`;
                    
                    items.forEach(item => {
                        // Use specialized display for citations and diffs
                        if (item.type === 'citation') {
                            html += `
                                <div class="citation-item">
                                    <div class="citation-header">
                                        <span class="citation-icon">📚</span>
                                        <h6 class="citation-title">Citation</h6>
                                    </div>
                                    ${item.htmlContent}
                                    <span class="priority-badge citation">${item.priority}</span>
                                </div>
                            `;
                        } else if (item.type === 'diff') {
                            html += `
                                <div class="diff-item">
                                    <div class="diff-header">
                                        <span class="diff-icon">✏️</span>
                                        <h6 class="diff-title">Suggested Edit</h6>
                                    </div>
                                    ${item.htmlContent}
                                    <span class="priority-badge diff">${item.priority}</span>
                                </div>
                            `;
                        } else {
                            // Standard feedback display
                            const priorityClass = item.type || item.priority;
                            html += `
                                <p class="feedback-${item.priority}">
                                    • ${this.escapeHTML(item.suggestion)}
                                    <span class="priority-badge ${priorityClass}">${item.priority}</span>
                                </p>
                            `;
                        }
                    });
                    
                    html += `</div>`;
                }
                html += '</div>';
                
                placeholder.outerHTML = html;
            }
        } else {
            // No feedback - show a simple message
            if (wasExistingContainer) {
                placeholder.classList.remove('loading-item');
                placeholder.id = '';
                
                const heading = placeholder.querySelector('h4');
                if (heading) {
                    heading.innerHTML = `✨ ${promptName}`;
                }
                
                // Remove loading content and add no-feedback message
                const elementsToRemove = placeholder.querySelectorAll('.category-section, p');
                elementsToRemove.forEach(el => el.remove());
                
                placeholder.insertAdjacentHTML('beforeend', '<p>No specific feedback at this time. Your text looks good!</p>');
            } else {
                placeholder.outerHTML = `
                    <div class="feedback-item">
                        <h4>✨ ${promptName}</h4>
                        <p>No specific feedback at this time. Your text looks good!</p>
                    </div>
                `;
            }
        }
    }

    removeRequestPlaceholder(requestId) {
        const placeholder = document.getElementById(`placeholder-${requestId}`);
        if (placeholder) {
            placeholder.remove();
        }
        
        const request = this.activeRequests.get(requestId);
        if (request && request.timerInterval) {
            clearInterval(request.timerInterval);
        }
        
        this.activeRequests.delete(requestId);
    }

    clearAllRequestPlaceholders() {
        // Clear all active request timers and placeholders
        this.activeRequests.forEach((request, requestId) => {
            this.removeRequestPlaceholder(requestId);
        });
        this.activeRequests.clear();
    }

    clearOnlyLoadingPlaceholders() {
        // Clear only placeholders that are currently loading (have timers)
        const loadingRequestIds = [];
        this.activeRequests.forEach((request, requestId) => {
            if (request.timerInterval) {
                loadingRequestIds.push(requestId);
            }
        });
        
        loadingRequestIds.forEach(requestId => {
            this.removeRequestPlaceholder(requestId);
        });
    }

    showUpdateIndicatorsForExistingFeedback(promptNames) {
        const container = document.getElementById('feedbackContainer');
        if (!container) return;
        
        promptNames.forEach(promptName => {
            // Find existing feedback container for this prompt
            const existingContainer = this.findExistingFeedbackContainer(promptName);
            if (existingContainer && !existingContainer.classList.contains('loading-item')) {
                // Add update indicator to existing container
                this.addUpdateIndicator(existingContainer, promptName);
            }
        });
    }

    findExistingFeedbackContainer(promptName) {
        const container = document.getElementById('feedbackContainer');
        if (!container) return null;
        
        // Look for a container with this prompt name in its heading
        const containers = container.querySelectorAll('.feedback-item');
        for (const cont of containers) {
            const heading = cont.querySelector('h4');
            if (heading && heading.textContent.includes(promptName)) {
                return cont;
            }
        }
        return null;
    }

    addUpdateIndicator(container, promptName) {
        // Remove any existing update indicator
        const existingIndicator = container.querySelector('.update-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Add a subtle update indicator
        const heading = container.querySelector('h4');
        if (heading) {
            const indicator = document.createElement('span');
            indicator.className = 'update-indicator';
            indicator.innerHTML = '🔄';
            indicator.style.opacity = '0.6';
            indicator.style.fontSize = '0.8em';
            indicator.style.marginLeft = '8px';
            heading.appendChild(indicator);
            
            // Start a subtle animation
            let opacity = 0.3;
            let increasing = true;
            const animateInterval = setInterval(() => {
                if (increasing) {
                    opacity += 0.1;
                    if (opacity >= 0.8) increasing = false;
                } else {
                    opacity -= 0.1;
                    if (opacity <= 0.3) increasing = true;
                }
                indicator.style.opacity = opacity;
            }, 200);
            
            // Store the interval so we can clear it later
            indicator.dataset.animationInterval = animateInterval;
        }
    }

    createOrUpdateRequestContainer(requestId, promptName, isLoading = false) {
        const container = document.getElementById('feedbackContainer');
        if (!container) return null;
        
        // Check if there's already a container for this prompt
        const existingContainer = this.findExistingFeedbackContainer(promptName);
        
        if (existingContainer && !isLoading) {
            // Just update the existing container
            return existingContainer;
        } else if (existingContainer && isLoading) {
            // Convert existing container to loading state
            this.convertToLoadingState(existingContainer, requestId, promptName);
            return existingContainer;
        } else {
            // Create new placeholder as before
            return this.createRequestPlaceholder(requestId, promptName);
        }
    }

    convertToLoadingState(existingContainer, requestId, promptName) {
        // Remove any existing update indicator
        const updateIndicator = existingContainer.querySelector('.update-indicator');
        if (updateIndicator) {
            // Clear the animation interval
            const intervalId = updateIndicator.dataset.animationInterval;
            if (intervalId) {
                clearInterval(parseInt(intervalId));
            }
            updateIndicator.remove();
        }
        
        // Add loading state to the existing container
        existingContainer.classList.add('loading-item');
        existingContainer.id = `placeholder-${requestId}`;
        
        // Add a loading indicator to the heading
        const heading = existingContainer.querySelector('h4');
        if (heading) {
            // Update the heading with loading indicator
            const originalText = heading.textContent.replace(/^[🔄✨]\s*/, '');
            heading.innerHTML = `🔄 ${originalText} <span class="loading-timer" id="timer-${requestId}">0.0s</span>`;
        }
        
        // Start timer for this request
        const startTime = Date.now();
        const timerInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const timerElement = document.getElementById(`timer-${requestId}`);
            if (timerElement) {
                timerElement.textContent = elapsed.toFixed(1) + 's';
            }
        }, 100);
        
        this.activeRequests.set(requestId, {
            startTime,
            timerInterval,
            promptName,
            existingContainer: true
        });
    }

    reorderFeedbackByPromptOrder(promptNames) {
        const container = document.getElementById('feedbackContainer');
        if (!container) return;
        
        // Get all feedback items
        const feedbackItems = Array.from(container.querySelectorAll('.feedback-item'));
        
        // Create a map of prompt name to DOM element
        const promptToElement = new Map();
        feedbackItems.forEach(item => {
            const heading = item.querySelector('h4');
            if (heading) {
                // Extract prompt name from heading text (remove emoji and trim)
                const promptName = heading.textContent.replace(/^[🔄✨]\s*/, '').trim();
                promptToElement.set(promptName, item);
            }
        });
        
        // Remove all items from container
        feedbackItems.forEach(item => item.remove());
        
        // Re-append items in the new order based on promptNames array
        promptNames.forEach(promptName => {
            const element = promptToElement.get(promptName);
            if (element) {
                container.appendChild(element);
            }
        });
        
        // Append any items that weren't in the promptNames list (like error messages)
        feedbackItems.forEach(item => {
            if (!container.contains(item)) {
                container.appendChild(item);
            }
        });
    }

    async generateIndividualPromptFeedback(content, promptId, prompt, onLoading, onProgressiveComplete, onError, settings = {}) {
        if (content.length < 10 || !settings.enableAIFeedback) return;

        if (this.isGeneratingFeedback) return; // Avoid conflicts with batch generation

        try {
            // Remove initial placeholder when generating first feedback
            const initialPlaceholder = document.getElementById('initialPlaceholder');
            if (initialPlaceholder) {
                initialPlaceholder.remove();
            }
            
            const requestId = `individual-${promptId}`;
            this.createOrUpdateRequestContainer(requestId, prompt.name, true);
            
            const result = await this.getPromptFeedback(content, prompt.name, prompt.prompt);
            
            if (result.requestId || requestId) {
                this.replaceRequestPlaceholderWithHTML(requestId, result.htmlContent, prompt.name);
            }

            // Notify completion
            onProgressiveComplete({
                groupedFeedback: [{
                    promptName: prompt.name,
                    htmlContent: result.htmlContent
                }],
                isComplete: true,
                completedCount: 1,
                totalCount: 1,
                isIndividualPrompt: true,
                promptId: promptId
            });

        } catch (error) {
            console.error('Error generating individual prompt feedback:', error);
            onError('Unable to generate feedback for ' + prompt.name);
        }
    }

    clearTimers() {
        clearTimeout(this.feedbackTimer);
        
        // Clear all individual prompt timers
        this.promptTimers.forEach((timer, timerId) => {
            clearTimeout(timer);
        });
        this.promptTimers.clear();
        this.lastTriggerContent.clear();
        
        // Clear all countdown intervals
        this.countdownCallbacks.forEach((interval, promptId) => {
            clearInterval(interval);
            this.removeCountdownDisplay(promptId);
        });
        this.countdownCallbacks.clear();
        this.promptTimerInfo.clear();
        this.pendingContent.clear();
        
        this.clearAllRequestPlaceholders();
    }
}
