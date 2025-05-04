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
  notification.classList.remove('hidden', 'success', 'error', 'warning');

  if (type) {
    notification.classList.add(type);
  }

  notification.style.animation = 'none';
  notification.offsetHeight;
  notification.style.animation = 'fadeIn 0.3s ease';

  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      notification.classList.add('hidden');
    }, 300);
  }, 3000);
}

// Auto save user input
function autoSaveUserInput() {
  const currentMessage = messageTemplate.value.trim();
  const usernames = usernameQueue.value
    .split('\n')
    .map(username => username.trim())
    .filter(username => username !== '');

  state.message = currentMessage;
  state.usernames = usernames;

  saveData();
}

// Load data from storage
function loadData() {
  chrome.storage.local.get(['igdmTurboState'], (result) => {
    if (result.igdmTurboState) {
      state = { ...state, ...result.igdmTurboState };

      messageButtonSelector.value = state.selectors.messageButtonSelector || '';
      textInputSelector.value = state.selectors.textInputSelector || '';
      sendButtonSelector.value = state.selectors.sendButtonSelector || '';

      messageDelay.value = state.timing.messageDelay || 5;
      processingDelay.value = state.timing.processingDelay || 5;

      messageTemplate.value = state.message || '';
      usernameQueue.value = [...state.usernames, ...state.processed].join('\n');

      updateQueueStats();
      updateStatus();
    }

    // Always show green dot (no license check)
    document.querySelector('.status-dot').style.backgroundColor = 'var(--success)';
  });
}

// Save data
function saveData() {
  chrome.storage.local.set({ igdmTurboState: state }, () => {
    console.log('State saved:', state);
  });
}

// Update queue stats
function updateQueueStats() {
  const total = state.usernames.length + state.processed.length;
  const processed = state.processed.length;
  const remaining = state.usernames.length;

  countTo(totalCount, total);
  countTo(processedCount, processed);
  countTo(remainingCount, remaining);
}

function countTo(element, target) {
  const current = parseInt(element.textContent) || 0;
  if (current === target) return;

  const increment = current < target ? 1 : -1;
  const duration = 300;
  const steps = 10;
  const step = Math.abs(target - current) / steps;

  let count = current;
  const interval = duration / steps;

  const counter = setInterval(() => {
    count += increment * step;
    if ((increment > 0 && count >= target) || (increment < 0 && count <= target)) {
      element.textContent = target;
      clearInterval(counter);
    } else {
      element.textContent = Math.round(count);
    }
  }, interval);
}

function updateStatus() {
  if (state.isProcessing) {
    statusText.textContent = 'Processing';
    statusText.classList.add('processing');
    document.querySelector('.status-dot').style.backgroundColor = 'var(--primary)';
    startProcess.disabled = true;
    pauseProcess.disabled = false;
  } else {
    statusText.textContent = 'Ready';
    statusText.classList.remove('processing');
    document.querySelector('.status-dot').style.backgroundColor = 'var(--success)';
    startProcess.disabled = false;
    pauseProcess.disabled = true;
  }
}

function startProcessing() {
  console.log("Start processing called"); // Check if this logs when you click start button

  if (!state.selectors.messageButtonSelector || 
      !state.selectors.textInputSelector || 
      !state.selectors.sendButtonSelector) {
    showNotification('Please configure selectors in Setup tab first', 'error');
    return;
  }

  const currentMessage = messageTemplate.value.trim();
  if (!currentMessage) {
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
  state.message = currentMessage;
  updateStatus();
  saveData();

  // Send message to background or content script to open a new tab
  chrome.runtime.sendMessage({ 
    action: 'startProcessing',
    data: {
      selectors: state.selectors,
      timing: state.timing,
      message: state.message,
      usernames: state.usernames,
      currentIndex: state.currentIndex
    }
  });

  showNotification('Started processing queue', 'success');
}

function pauseProcessing() {
  state.isProcessing = false;
  updateStatus();
  saveData();

  chrome.runtime.sendMessage({ action: 'pauseProcessing' });
  showNotification('Paused processing queue');
}

function resetQueueData() {
  const confirmReset = confirm('Are you sure you want to reset the queue? This will clear all usernames and messages. This action cannot be undone.');

  if (confirmReset) {
    if (messageTemplate) {
      messageTemplate.value = '';  // Reset message template
    } else {
      console.error("messageTemplate element is not found.");
    }

    if (usernameQueue) {
      usernameQueue.value = '';  // Reset username queue
    } else {
      console.error("usernameQueue element is not found.");
    }

    state.processed = [];
    state.currentIndex = 0;
    state.usernames = [];
    state.message = '';

    updateQueueStats();
    saveData();

    showNotification('Queue and messages have been reset', 'success');
  }
}

// Event listeners for saving selectors
saveSelectors.addEventListener('click', () => {
  state.selectors.messageButtonSelector = messageButtonSelector.value.trim();
  state.selectors.textInputSelector = textInputSelector.value.trim();
  state.selectors.sendButtonSelector = sendButtonSelector.value.trim();

  saveData();
  showNotification('Selectors saved successfully', 'success');
});

// Event listeners for saving timings
saveTimings.addEventListener('click', () => {
  state.timing.messageDelay = parseInt(messageDelay.value, 10) || 5; // Default to 5 if no value
  state.timing.processingDelay = parseInt(processingDelay.value, 10) || 5; // Default to 5 if no value

  saveData();
  showNotification('Timings saved successfully', 'success');
});

// Auto-save user input when message template or username queue changes
function autoSaveUserInput() {
  const currentMessage = messageTemplate.value.trim();
  const usernames = usernameQueue.value
    .split('\n')
    .map(username => username.trim())
    .filter(username => username !== '');

  state.message = currentMessage;
  state.usernames = usernames;

  saveData();
}

messageTemplate.addEventListener('input', autoSaveUserInput);
usernameQueue.addEventListener('input', autoSaveUserInput);

document.addEventListener('DOMContentLoaded', () => {
  // Ensure the default view is showing the "Messages" panel
  const messagesTabLink = document.getElementById('messages-tab-link');
  const setupTabLink = document.getElementById('setup-tab-link');
  const messagesPanel = document.getElementById('messages-panel');
  const setupPanel = document.getElementById('setup-panel');

  messagesPanel.classList.add('active');
  setupPanel.classList.remove('active');

  // Event listener to show Messages panel
  messagesTabLink.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent default anchor behavior

    // Show Messages Panel
    messagesPanel.classList.add('active');
    setupPanel.classList.remove('active');

    // Update tab styles to reflect the active tab
    messagesTabLink.classList.add('active');
    setupTabLink.classList.remove('active');
  });

  // Event listener to show Setup panel
  setupTabLink.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent default anchor behavior

    // Show Setup Panel
    setupPanel.classList.add('active');
    messagesPanel.classList.remove('active');

    // Update tab styles to reflect the active tab
    setupTabLink.classList.add('active');
    messagesTabLink.classList.remove('active');
  });

  // Load the data from storage when the DOM content is loaded
  loadData();
});

startProcess.addEventListener('click', startProcessing);
pauseProcess.addEventListener('click', pauseProcessing);
resetQueue.addEventListener('click', resetQueueData);
