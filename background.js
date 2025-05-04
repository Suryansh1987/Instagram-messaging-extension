// Global state for background processing
let processingState = {
  isProcessing: false,
  currentUsername: null,
  usernames: [],
  processedUsernames: [],
  currentIndex: 0,
  message: '',
  selectors: {},
  timing: {
    messageDelay: 5,
    processingDelay: 5,
  },
};

let processingTabId = null;
let processingTimer = null;
const STORAGE_KEY = 'igdm_state';

// Save processing state to Chrome storage
function saveState() {
  const { usernames, processedUsernames, currentIndex, isProcessing } = processingState;
  const updatedState = { usernames, processed: processedUsernames, currentIndex, isProcessing };

  chrome.storage.local.set({ [STORAGE_KEY]: updatedState }, () => {
    console.log("State saved to local storage.");
  });
}

// Retrieve saved state from Chrome storage (for restoration)
function loadState() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY]) {
      processingState = { ...processingState, ...result[STORAGE_KEY] };
      console.log("State loaded from local storage.");
    }
  });
}

// Open next Instagram profile and trigger content script
function processNextUsername() {
  if (!processingState.isProcessing || processingState.usernames.length === 0) {
    processingState.isProcessing = false;
    chrome.runtime.sendMessage({ action: 'processingComplete' });
    saveState();
    return;
  }

  processingState.currentUsername = processingState.usernames[processingState.currentIndex];

  chrome.tabs.create(
    { url: `https://www.instagram.com/${processingState.currentUsername}/`, active: false },
    (tab) => {
      processingTabId = tab.id;

      processingTimer = setTimeout(() => {
        chrome.tabs.sendMessage(processingTabId, {
          action: 'clickMessageButton',
          data: {
            usernames: [processingState.currentUsername],
            selectors: processingState.selectors,
            message: processingState.message,
            timing: processingState.timing,
            currentIndex: processingState.currentIndex
          },
        });
        
        
      }, processingState.timing.messageDelay * 1000); // Delay to ensure page is loaded
    }
  );
}

// Called by content script when message is successfully sent
function handleMessageSent(username) {
  console.log(`✅ Message sent to: ${username}`);

  processingState.usernames.splice(processingState.currentIndex, 1);
  processingState.processedUsernames.push(username);

  saveState();

  chrome.runtime.sendMessage({
    action: 'updateState',
    data: {
      usernames: processingState.usernames,
      processed: processingState.processedUsernames,
      currentIndex: processingState.currentIndex,
      isProcessing: processingState.isProcessing,
    },
  });

  // Cleanup after processing current user
  if (processingTabId) {
    chrome.tabs.remove(processingTabId);
    processingTabId = null;
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

  chrome.runtime.sendMessage({ action: 'error', error: `Failed to message ${username}: ${error}` });

  // Cleanup after failure
  if (processingTabId) {
    chrome.tabs.remove(processingTabId);
    processingTabId = null;
  }

  // Move to next username after failure
  processingTimer = setTimeout(processNextUsername, processingState.timing.processingDelay * 1000);
}

// Message listener from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startProcessing':
      // Initialize processing state
      processingState = {
        isProcessing: true,
        currentUsername: null,
        usernames: message.data.usernames,
        processedUsernames: [],
        currentIndex: message.data.currentIndex || 0,
        message: message.data.message,
        selectors: message.data.selectors,
        timing: {
          messageDelay: message.data.timing?.messageDelay || 5,
          processingDelay: message.data.timing?.processingDelay || 5,
        },
      };
      processNextUsername();
      break;

    case 'messageSent':
      handleMessageSent(processingState.currentUsername);
      break;

    case 'messageFailed':
      handleMessageFailed(processingState.currentUsername, message.error || 'Unknown error');
      break;

    case 'loadState':
      loadState();
      break;
  }

  sendResponse({ received: true });
  return true;
});

// Load state on extension startup
loadState();
