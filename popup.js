// Connection management
let backgroundConnected = false;

// Function to test connection to background script
function checkBackgroundConnection() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'ping' }, response => {
        if (chrome.runtime.lastError) {
          console.log("Background not ready yet:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        
        if (response && response.status === 'ok') {
          backgroundConnected = true;
          resolve(true);
        } else {
          resolve(false);
        }
      });
    } catch (error) {
      console.error("Error checking background connection:", error);
      resolve(false);
    }
  });
}

// Safe message sending function
async function sendMessageToBackground(message) {
  // Try to establish connection if not already connected
  if (!backgroundConnected) {
    backgroundConnected = await checkBackgroundConnection();
    
    if (!backgroundConnected) {
      console.warn("Background connection not established");
      return null;
    }
  }
  
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
          backgroundConnected = false;
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (error) {
      console.error("Exception sending message:", error);
      backgroundConnected = false;
      resolve(null);
    }
  });
}

function debounce(func, wait, immediate) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

// DOM Elements
let messageButtonSelector = document.getElementById('messageButtonSelector');
let textInputSelector = document.getElementById('textInputSelector');
let sendButtonSelector = document.getElementById('sendButtonSelector');
let saveSelectors = document.getElementById('saveSelectors');

let messageDelay = document.getElementById('messageDelay');
let processingDelay = document.getElementById('processingDelay');
let saveTimings = document.getElementById('saveTimings');

let messageTemplate = document.getElementById('messageTemplate');
let usernameQueue = document.getElementById('usernameQueue');
let startProcess = document.getElementById('startProcess');
let pauseProcess = document.getElementById('pauseProcess');
let resetQueue = document.getElementById('resetQueue');

let totalCount = document.getElementById('total-count');
let processedCount = document.getElementById('processed-count');
let remainingCount = document.getElementById('remaining-count');
let freeDmCount = document.getElementById('free-dm-count');

let statusText = document.getElementById('status-text');
let notification = document.getElementById('notification');

// Default state
let state = {
  selectors: {
    messageButtonSelector: '',
    textInputSelector: '',
    sendButtonSelector: ''
  },
  timing: {
    messageDelay: 5,
    processingDelay: 5
  },
  message: '',
  usernames: [],
  processed: [],
  isProcessing: false,
  currentIndex: 0
};

// Show notification
function showNotification(message, type = '') {
  notification.textContent = message;
  notification.className = "notification show";

  if (type === 'error') {
    notification.style.backgroundColor = "#ffebee";
    notification.style.color = "#c62828";
  } else {
    notification.style.backgroundColor = "#e8f5e9";
    notification.style.color = "#2e7d32";
  }

  setTimeout(() => {
    notification.className = "notification";
  }, 3000);
}

// Auto save selectors when they change
function autoSaveSelectors() {
  state.selectors = {
    messageButtonSelector: messageButtonSelector.value.trim(),
    textInputSelector: textInputSelector.value.trim(),
    sendButtonSelector: sendButtonSelector.value.trim()
  };

  saveData();
  console.log("Selectors auto-saved:", state.selectors);
}

// Auto save timings when they change
function autoSaveTimings() {
  state.timing = {
    messageDelay: parseInt(messageDelay.value, 10) || 5,
    processingDelay: parseInt(processingDelay.value, 10) || 5
  };

  saveData();
  console.log("Timings auto-saved:", state.timing);
}

// Auto save message template when it changes
function autoSaveMessage() {
  state.message = messageTemplate.value.trim();
  saveData();
  console.log("Message template auto-saved:", state.message);
}

// Auto save user input
function autoSaveUserInput() {
  const usernames = usernameQueue.value
    .split('\n')
    .map(username => username.trim())
    .filter(username => username !== '');

  state.usernames = usernames;

  // Important: Update the UI when usernames change
  updateQueueStats();
  saveData();
}

// Load data from storage
function loadData() {
  chrome.storage.local.get(['tnmUIState'], (result) => {
    if (result.tnmUIState) {
      console.log("Loaded state from storage:", result.tnmUIState);
      
      // Merge the loaded state with default state
      state = { 
        ...state, 
        ...result.tnmUIState,
        selectors: { 
          ...state.selectors, 
          ...(result.tnmUIState.selectors || {}) 
        },
        timing: { 
          ...state.timing, 
          ...(result.tnmUIState.timing || {}) 
        }
      };

      // Update UI with loaded values
      if (state.selectors) {
        messageButtonSelector.value = state.selectors.messageButtonSelector || '';
        textInputSelector.value = state.selectors.textInputSelector || '';
        sendButtonSelector.value = state.selectors.sendButtonSelector || '';
      }

      if (state.timing) {
        messageDelay.value = state.timing.messageDelay || 5;
        processingDelay.value = state.timing.processingDelay || 5;
      }

      messageTemplate.value = state.message || '';
      
      // Set the username queue with both active and processed usernames
      const allUsernames = [...(state.usernames || []), ...(state.processed || [])];
      usernameQueue.value = allUsernames.join('\n');

      // Update UI elements
      updateQueueStats();
      updateStatus();
      
      // Set free DM count
      freeDmCount.textContent = state.processed?.length || 0;
    }

    // Always show green dot
    document.querySelector('.status-dot').style.backgroundColor = '#4CAF50';
    
    // Check background connection
    checkBackgroundConnection().then(connected => {
      console.log("Background connection established:", connected);
      if (connected) {
        // Load state from background script to sync
        sendMessageToBackground({ action: 'getState' }).then(response => {
          if (response && response.data) {
            // Update state with background data
            state.isProcessing = response.data.isProcessing;
            state.usernames = response.data.usernames || [];
            state.processed = response.data.processed || [];
            state.currentIndex = response.data.currentIndex || 0;
            
            // Make sure we preserve the message and selectors
            if (response.data.message) state.message = response.data.message;
            if (response.data.selectors) state.selectors = response.data.selectors;
            if (response.data.timing) state.timing = response.data.timing;
            
            // Update UI with the data
            messageButtonSelector.value = state.selectors.messageButtonSelector || '';
            textInputSelector.value = state.selectors.textInputSelector || '';
            sendButtonSelector.value = state.selectors.sendButtonSelector || '';
            
            messageDelay.value = state.timing.messageDelay || 5;
            processingDelay.value = state.timing.processingDelay || 5;
            
            messageTemplate.value = state.message || '';
            
            updateQueueStats();
            updateStatus();
          }
        });
      }
    });
  });
}

// Save data
function saveData() {
  // Always get the latest values from form fields
  state.selectors = {
    messageButtonSelector: messageButtonSelector.value.trim(),
    textInputSelector: textInputSelector.value.trim(),
    sendButtonSelector: sendButtonSelector.value.trim()
  };
  
  state.timing = {
    messageDelay: parseInt(messageDelay.value) || 5,
    processingDelay: parseInt(processingDelay.value) || 5
  };
  
  state.message = messageTemplate.value.trim();
  
  // Save to local storage
  chrome.storage.local.set({ tnmUIState: state }, () => {
    console.log('State saved to storage:', state);
    
    // Also sync with background script
    sendMessageToBackground({
      action: 'syncState',
      data: state
    }).then(response => {
      console.log("State synced with background:", response);
    }).catch(error => {
      console.error("Failed to sync state with background");
    });
  });
}

// Update queue stats
function updateQueueStats() {
  const total = state.usernames.length + state.processed.length;
  const processed = state.processed.length;
  const remaining = state.usernames.length;

  console.log("Updating queue stats:", { total, processed, remaining });
  
  totalCount.textContent = total;
  processedCount.textContent = processed;
  remainingCount.textContent = remaining;
  freeDmCount.textContent = processed;
}

function updateStatus() {
  if (state.isProcessing) {
    statusText.textContent = 'Processing';
    document.querySelector('.status-dot').style.backgroundColor = '#FF9800';
    startProcess.disabled = true;
    pauseProcess.disabled = false;
  } else {
    statusText.textContent = 'Ready';
    document.querySelector('.status-dot').style.backgroundColor = '#4CAF50';
    startProcess.disabled = false;
    pauseProcess.disabled = true;
  }
}

async function startProcessing() {
  console.log("Start processing called");

  // Save all current form values
  autoSaveSelectors();
  autoSaveTimings();
  autoSaveMessage();
  autoSaveUserInput();

  if (!state.selectors.messageButtonSelector || 
      !state.selectors.textInputSelector || 
      !state.selectors.sendButtonSelector) {
    showNotification('Please configure selectors in Setup tab first', 'error');
    return;
  }

  if (!state.message) {
    showNotification('Please enter a message template', 'error');
    return;
  }

  state.usernames = usernameQueue.value
    .split('\n')
    .map(username => username.trim())
    .filter(username => username !== '')
    .filter(username => !state.processed.includes(username));

  if (state.usernames.length === 0) {
    showNotification('No usernames in queue to process', 'error');
    return;
  }

  state.isProcessing = true;
  updateStatus();
  saveData();

  // Send message to background script using safe method
  const response = await sendMessageToBackground({ 
    action: 'startProcessing',
    data: {
      selectors: state.selectors,
      timing: state.timing,
      message: state.message,
      usernames: state.usernames,
      currentIndex: state.currentIndex
    }
  });

  if (response) {
    showNotification('Started processing queue');
  } else {
    state.isProcessing = false;
    updateStatus();
    showNotification('Failed to start processing. Please reload extension.', 'error');
  }
}

async function pauseProcessing() {
  const response = await sendMessageToBackground({ action: 'pauseProcessing' });
  
  if (response) {
    state.isProcessing = false;
    updateStatus();
    saveData();
    showNotification('Paused processing queue');
  } else {
    showNotification('Failed to pause processing. Please reload extension.', 'error');
  }
}

function resetQueueData() {
  const confirmReset = confirm('Are you sure you want to reset the queue? This will clear all usernames and messages.');

  if (confirmReset) {
    if (messageTemplate) {
      messageTemplate.value = '';
    }

    if (usernameQueue) {
      usernameQueue.value = '';
    }

    state.processed = [];
    state.currentIndex = 0;
    state.usernames = [];
    state.message = '';

    updateQueueStats();
    saveData();

    showNotification('Queue and messages have been reset');
  }
}

// Add input event listeners with debouncing for auto-saving
messageButtonSelector.addEventListener('input', debounce(autoSaveSelectors, 500));
textInputSelector.addEventListener('input', debounce(autoSaveSelectors, 500));
sendButtonSelector.addEventListener('input', debounce(autoSaveSelectors, 500));

messageDelay.addEventListener('input', debounce(autoSaveTimings, 500));
processingDelay.addEventListener('input', debounce(autoSaveTimings, 500));

messageTemplate.addEventListener('input', debounce(autoSaveMessage, 500));
usernameQueue.addEventListener('input', debounce(autoSaveUserInput, 500));

// Event listeners for saving selectors with button click
saveSelectors.addEventListener('click', () => {
  autoSaveSelectors();
  showNotification('Selectors saved successfully');
});

// Event listeners for saving timings with button click
saveTimings.addEventListener('click', () => {
  autoSaveTimings();
  showNotification('Timings saved successfully');
});

// Use debounced function for live count update
usernameQueue.addEventListener('input', debounce(function() {
  const lines = this.value.split('\n').filter(line => line.trim() !== '');
  totalCount.textContent = lines.length;
  remainingCount.textContent = lines.length;
}, 300));

// Listen for background script messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Popup received message:", message);
  
  switch (message.action) {
    case 'updateState':
      if (message.data) {
        state.usernames = message.data.usernames || state.usernames;
        state.processed = message.data.processed || state.processed;
        state.currentIndex = message.data.currentIndex || state.currentIndex;
        state.isProcessing = message.data.isProcessing;
        
        // Also update message and selectors if provided
        if (message.data.message) {
          state.message = message.data.message;
          messageTemplate.value = state.message;
        }
        
        if (message.data.selectors) {
          state.selectors = message.data.selectors;
          messageButtonSelector.value = state.selectors.messageButtonSelector || '';
          textInputSelector.value = state.selectors.textInputSelector || '';
          sendButtonSelector.value = state.selectors.sendButtonSelector || '';
        }
        
        updateQueueStats();
        updateStatus();
        saveData();
      }
      break;
      
    case 'processingComplete':
      state.isProcessing = false;
      updateStatus();
      showNotification('Processing completed!');
      break;
      
    case 'error':
      showNotification(message.error || 'An error occurred', 'error');
      break;
      
    case 'stateUpdated':
      // Update state from background if available
      if (message.data) {
        if (message.data.processed) state.processed = message.data.processed;
        if (message.data.usernames) state.usernames = message.data.usernames;
        if (message.data.currentIndex) state.currentIndex = message.data.currentIndex;
        if (message.data.isProcessing !== undefined) state.isProcessing = message.data.isProcessing;
        
        // Also update message and selectors if provided
        if (message.data.message) {
          state.message = message.data.message;
          messageTemplate.value = state.message;
        }
        
        if (message.data.selectors) {
          state.selectors = message.data.selectors;
          messageButtonSelector.value = state.selectors.messageButtonSelector || '';
          textInputSelector.value = state.selectors.textInputSelector || '';
          sendButtonSelector.value = state.selectors.sendButtonSelector || '';
        }
        
        updateQueueStats();
        updateStatus();
      }
      break;
  }
  
  sendResponse({ received: true });
  return true;
});

document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup DOM loaded");
  
  // Ensure the default view is showing the "Messages" panel
  const messagesTabLink = document.getElementById('messages-tab-link');
  const setupTabLink = document.getElementById('setup-tab-link');
  const messagesPanel = document.getElementById('messages-panel');
  const setupPanel = document.getElementById('setup-panel');

  messagesPanel.classList.add('active');
  setupPanel.classList.remove('active');

  // Event listener to show Messages panel
  messagesTabLink.addEventListener('click', (event) => {
    event.preventDefault();
    messagesPanel.classList.add('active');
    setupPanel.classList.remove('active');
    messagesTabLink.classList.add('active');
    setupTabLink.classList.remove('active');
  });

  // Event listener to show Setup panel
  setupTabLink.addEventListener('click', (event) => {
    event.preventDefault();
    setupPanel.classList.add('active');
    messagesPanel.classList.remove('active');
    setupTabLink.classList.add('active');
    messagesTabLink.classList.remove('active');
  });

  // Load the data from storage when the DOM content is loaded
  loadData();
  
  // Establish background connection
  checkBackgroundConnection().then(connected => {
    console.log("Initial background connection status:", connected);
  });
});

// Add click event listeners for buttons
startProcess.addEventListener('click', startProcessing);
pauseProcess.addEventListener('click', pauseProcessing);
resetQueue.addEventListener('click', resetQueueData);