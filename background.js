// Global state for background processing
let processingState = {
  isProcessing: false,
  currentUsername: null,
  usernames: [],
  processedUsernames: [],
  currentIndex: 0,
  message: '',
  selectors: {
    messageButtonSelector: '',
    textInputSelector: '',
    sendButtonSelector: ''
  },
  timing: {
    messageDelay: 5,
    processingDelay: 5,
  },
};

let processingTabId = null;
let processingTimer = null;
const STORAGE_KEY = 'tnmUIState'; // Match storage key used in popup.js

// Save processing state to Chrome storage
function saveState() {
  const { usernames, processedUsernames, currentIndex, isProcessing, message, selectors, timing } = processingState;
  const updatedState = { 
    usernames, 
    processed: processedUsernames, 
    currentIndex, 
    isProcessing,
    message,
    selectors,
    timing
  };

  chrome.storage.local.set({ [STORAGE_KEY]: updatedState }, () => {
    console.log("State saved to local storage:", updatedState);
    // Notify popup if it's open
    try {
      chrome.runtime.sendMessage({
        action: 'stateUpdated',
        data: updatedState
      }).catch(error => {
        // Ignore errors when popup is not open
        console.log("Popup not available for state update");
      });
    } catch (error) {
      console.log("Error sending update to popup - likely not open");
    }
  });
}

// Retrieve saved state from Chrome storage (for restoration)
function loadState() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY]) {
      // Make sure we properly preserve nested objects
      const savedState = result[STORAGE_KEY];
      
      processingState = { 
        ...processingState,
        ...savedState,
        selectors: { ...processingState.selectors, ...(savedState.selectors || {}) },
        timing: { ...processingState.timing, ...(savedState.timing || {}) }
      };
      
      console.log("State loaded from local storage:", processingState);
    }
  });
}

// Safely send message to a tab with full error handling
function safelySendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    if (!tabId) {
      console.error("No tab ID provided");
      reject(new Error("No tab ID provided"));
      return;
    }
    
    // First check if tab exists
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Tab check error:", chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Tab exists, try sending message
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Send message error:", chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          resolve(response || { received: true });
        });
      } catch (error) {
        console.error("Exception sending tab message:", error);
        reject(error);
      }
    });
  });
}

// Open next Instagram profile and trigger content script
function processNextUsername() {
  if (!processingState.isProcessing || processingState.usernames.length === 0) {
    processingState.isProcessing = false;
    try {
      chrome.runtime.sendMessage({ action: 'processingComplete' }).catch(error => {
        console.log("Popup not available for completion message");
      });
    } catch (error) {
      console.log("Error sending completion message - popup likely closed");
    }
    saveState();
    return;
  }

  processingState.currentUsername = processingState.usernames[processingState.currentIndex];
  console.log(`Processing username: ${processingState.currentUsername}`);

  // Create a new tab with the Instagram profile
  chrome.tabs.create(
    { url: `https://www.instagram.com/${processingState.currentUsername}/`, active: false },
    (tab) => {
      if (!tab || chrome.runtime.lastError) {
        console.error("Error creating tab:", chrome.runtime.lastError);
        handleMessageFailed(processingState.currentUsername, "Failed to create tab");
        return;
      }
      
      processingTabId = tab.id;
      console.log(`Created tab with ID: ${processingTabId}`);

      // Wait for the page to load before sending message to content script
      processingTimer = setTimeout(() => {
        // Verify tab still exists before sending message
        chrome.tabs.get(processingTabId, (tabInfo) => {
          if (chrome.runtime.lastError) {
            console.error("Tab no longer exists:", chrome.runtime.lastError);
            handleMessageFailed(processingState.currentUsername, "Tab was closed");
            return;
          }
          
          // Tab exists, try to communicate with content script
          safelySendMessageToTab(processingTabId, {
            action: 'clickMessageButton',
            data: {
              usernames: [processingState.currentUsername],
              selectors: processingState.selectors,
              message: processingState.message,
              timing: processingState.timing,
              currentIndex: processingState.currentIndex
            }
          }).then(response => {
            console.log("Message sent to content script successfully");
          }).catch(error => {
            console.error("Failed to communicate with content script:", error);
            // Wait a little longer and try again - content script might still be initializing
            setTimeout(() => {
              safelySendMessageToTab(processingTabId, {
                action: 'clickMessageButton',
                data: {
                  usernames: [processingState.currentUsername],
                  selectors: processingState.selectors,
                  message: processingState.message,
                  timing: processingState.timing,
                  currentIndex: processingState.currentIndex
                }
              }).catch(secondError => {
                console.error("Second attempt failed:", secondError);
                handleMessageFailed(processingState.currentUsername, "Content script not responding");
              });
            }, 5000); // Wait 5 more seconds and try again
          });
        });
      }, processingState.timing.messageDelay * 1000); // Delay to ensure page is loaded
    }
  );
}

// Called by content script when message is successfully sent
function handleMessageSent(username) {
  console.log(`✅ Message sent to: ${username}`);

  // Update the processing state
  processingState.usernames.splice(processingState.currentIndex, 1);
  processingState.processedUsernames.push(username);
  saveState();

  // Try to notify popup of state update
  try {
    chrome.runtime.sendMessage({
      action: 'updateState',
      data: {
        usernames: processingState.usernames,
        processed: processingState.processedUsernames,
        currentIndex: processingState.currentIndex,
        isProcessing: processingState.isProcessing,
        message: processingState.message,
        selectors: processingState.selectors,
        timing: processingState.timing
      }
    }).catch(error => {
      console.log("Popup not available for state update");
    });
  } catch (error) {
    console.log("Error sending update to popup - likely closed");
  }

  // Cleanup after processing current user
  if (processingTabId) {
    try {
      chrome.tabs.remove(processingTabId, () => {
        if (chrome.runtime.lastError) {
          console.log("Error removing tab (might already be closed):", chrome.runtime.lastError);
        }
        processingTabId = null;
      });
    } catch (error) {
      console.error("Exception removing tab:", error);
      processingTabId = null;
    }
  }

  // Move to next username after the message delay
  processingTimer = setTimeout(processNextUsername, processingState.timing.processingDelay * 1000);
}

// Called when message sending fails
function handleMessageFailed(username, error) {
  console.error(`❌ Failed to message ${username}: ${error}`);

  // Move to next username and handle failure gracefully
  processingState.currentIndex = (processingState.currentIndex + 1) % processingState.usernames.length;
  saveState();

  // Try to notify popup of error
  try {
    chrome.runtime.sendMessage({ 
      action: 'error', 
      error: `Failed to message ${username}: ${error}` 
    }).catch(err => {
      console.log("Popup not available for error notification");
    });
  } catch (err) {
    console.log("Error sending error message to popup - likely closed");
  }

  // Cleanup after failure
  if (processingTabId) {
    try {
      chrome.tabs.remove(processingTabId, () => {
        if (chrome.runtime.lastError) {
          console.log("Error removing tab (might already be closed):", chrome.runtime.lastError);
        }
        processingTabId = null;
      });
    } catch (error) {
      console.error("Exception removing tab:", error);
      processingTabId = null;
    }
  }

  // Move to next username after failure
  processingTimer = setTimeout(processNextUsername, processingState.timing.processingDelay * 1000);
}

// Handle ping request to check if background script is ready
function handlePing(sendResponse) {
  console.log("Received ping from popup");
  sendResponse({ status: 'ok' });
}

// Message listener from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.action, "from", sender.id);

  try {
    switch (message.action) {
      case 'ping':
        handlePing(sendResponse);
        break;

      case 'syncState':
        // Sync the entire state from popup
        if (message.data) {
          console.log("Syncing state from popup:", message.data);
          
          // Update all fields while preserving nested objects
          processingState = {
            ...processingState,
            ...message.data,
            selectors: { ...processingState.selectors, ...(message.data.selectors || {}) },
            timing: { ...processingState.timing, ...(message.data.timing || {}) }
          };
          
          saveState();
          sendResponse({ status: 'state_synced' });
        } else {
          sendResponse({ status: 'error', error: 'No data provided for sync' });
        }
        break;

      case 'startProcessing':
        console.log("Starting processing with data:", message.data);
        
        // Make sure to save all the data including selectors and message
        processingState = {
          isProcessing: true,
          currentUsername: null,
          usernames: message.data.usernames || [],
          processedUsernames: processingState.processedUsernames || [],
          currentIndex: message.data.currentIndex || 0,
          message: message.data.message || '',
          selectors: message.data.selectors || {},
          timing: {
            messageDelay: message.data.timing?.messageDelay || 5,
            processingDelay: message.data.timing?.processingDelay || 5,
          },
        };
        
        // Save state to storage immediately
        saveState();
        
        // Start processing
        processNextUsername();
        sendResponse({ status: 'processing_started' });
        break;

      case 'pauseProcessing':
        console.log("Pausing processing");
        processingState.isProcessing = false;
        
        // Clear any pending timers
        if (processingTimer) {
          clearTimeout(processingTimer);
          processingTimer = null;
        }
        
        // Close any open tabs
        if (processingTabId) {
          try {
            chrome.tabs.remove(processingTabId, () => {
              if (chrome.runtime.lastError) {
                console.log("Error removing tab (might already be closed):", chrome.runtime.lastError);
              }
              processingTabId = null;
            });
          } catch (error) {
            console.error("Exception removing tab:", error);
            processingTabId = null;
          }
        }
        
        saveState();
        sendResponse({ status: 'processing_paused' });
        break;

      case 'messageSent':
        handleMessageSent(processingState.currentUsername);
        sendResponse({ status: 'message_processed' });
        break;

      case 'messageFailed':
        handleMessageFailed(processingState.currentUsername, message.error || 'Unknown error');
        sendResponse({ status: 'failure_handled' });
        break;

      case 'loadState':
        loadState();
        sendResponse({ status: 'state_loaded' });
        break;

      case 'getState':
        sendResponse({ 
          status: 'state_provided',
          data: {
            isProcessing: processingState.isProcessing,
            usernames: processingState.usernames,
            processed: processingState.processedUsernames,
            currentIndex: processingState.currentIndex,
            message: processingState.message,
            selectors: processingState.selectors,
            timing: processingState.timing
          } 
        });
        break;

      case 'saveSelectors':
        // Handle specific selector updates from popup
        if (message.data && message.data.selectors) {
          processingState.selectors = message.data.selectors;
          saveState();
          sendResponse({ status: 'selectors_saved' });
        } else {
          sendResponse({ status: 'error', error: 'No selector data provided' });
        }
        break;
        
      case 'saveMessage':
        // Handle message template updates from popup
        if (message.data && message.data.message !== undefined) {
          processingState.message = message.data.message;
          saveState();
          sendResponse({ status: 'message_saved' });
        } else {
          sendResponse({ status: 'error', error: 'No message data provided' });
        }
        break;

      default:
        console.log("Unknown action:", message.action);
        sendResponse({ status: 'unknown_action' });
        break;
    }
  } catch (error) {
    console.error("Error processing message:", error);
    sendResponse({ status: 'error', error: error.message });
  }

  return true; // Keep the message channel open for async responses
});

// Make sure we're ready when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("TNM UI extension installed or updated");
  loadState();
});

// Listen for browser startup to restore state
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started - loading TNM UI state");
  loadState();
});

// Listen for connection status changes
chrome.runtime.onConnect.addListener(port => {
  console.log("New connection established with", port.name);
  
  port.onDisconnect.addListener(() => {
    console.log("Connection with", port.name, "closed");
  });
});

console.log("TNM UI background script loaded");