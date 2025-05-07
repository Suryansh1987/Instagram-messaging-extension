// TNM UI content script

// State to track processing on this page
let pageState = {
  isProcessing: false,
  selectors: {},
  message: '',
  timing: {},
  currentIndex: 0,
  usernames: []
};

// Utility function to try different variations of a selector
function findElement(selectorsList) {
  for (const selector of selectorsList) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch (e) {
      console.error(`Error finding element with selector: ${selector}`, e);
    }
  }
  return null;
}

// Abstracted function for finding any element by selector variations
function findElementBySelector(selector) {
  const variations = [
    selector,
    `.${selector}`,
    `[class='${selector}']`,
    `[class*='${selector}']`
  ];
  return findElement(variations);
}

// Check if page context is still valid
function isContextValid() {
  if (!document || document.readyState !== "complete") {
    console.error("Document context invalidated.");
    return false;
  }
  if (!window.location.href.includes("instagram.com")) {
    console.error("Invalid Instagram page.");
    return false;
  }
  return true;
}

// Click the message button
function clickMessageButton() {
  console.log("Looking for message button...");

  if (!isContextValid()) return skipToNextUsername();

  const variations = [
    pageState.selectors.messageButtonSelector,
    `.${pageState.selectors.messageButtonSelector}`,
    `[class='${pageState.selectors.messageButtonSelector}']`,
    `[class*='${pageState.selectors.messageButtonSelector}']`
  ];

  let attempts = 0;
  const maxAttempts = 10; // Try for 10 seconds

  const interval = setInterval(() => {
    const messageButton = findElement(variations);

    if (messageButton) {
      clearInterval(interval);
      console.log("✅ Message button found. Clicking...");
      messageButton.click();
      setTimeout(clickTextBox, 6000);
    } else {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.error("❌ Message button not found after timeout.");
        chrome.runtime.sendMessage({
          action: 'messageFailed',
          error: 'Message button not found (likely private or invalid profile)'
        });
        skipToNextUsername(); // Skip to the next username
      }
    }
  }, 1000);
}

// Focus the text input
function clickTextBox() {
  console.log("Looking for text input...");

  if (!isContextValid()) return skipToNextUsername();

  const textInput = findElementBySelector(pageState.selectors.textInputSelector);
  
  if (!textInput) {
    console.error("Text input not found");
    return skipToNextUsername();
  }

  textInput.click();
  
  // Wait for input focus, then enter message text
  setTimeout(() => enterMessageText(textInput), 2000);
}

// Enter message text
function enterMessageText(textInput) {
  if (!textInput) {
    console.error("No text input found");
    return skipToNextUsername();
  }

  textInput.focus();
  document.execCommand("insertText", false, pageState.message);
  
  // Wait for a moment before clicking the send button
  setTimeout(clickSendButton, 2000);
}

// Click the send button
function clickSendButton() {
  console.log("Looking for send button...");

  if (!isContextValid()) return skipToNextUsername();

  const sendButton = findElementBySelector(pageState.selectors.sendButtonSelector);

  if (!sendButton) {
    console.error("Send button not found");
    return skipToNextUsername();
  }

  sendButton.click();
  
  // Notify background script that the message was sent and skip to next username
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'messageSent' });
    skipToNextUsername();
  }, 2000);
}

// Skip to the next username in the list
function skipToNextUsername() {
  console.log("Skipping to next username...");

  // Increment the current index and check if all usernames have been processed
  pageState.currentIndex++;
  
  if (pageState.currentIndex >= pageState.usernames.length) {
    pageState.isProcessing = false;
    console.log("All usernames processed.");
    return;
  }

  // Proceed to the next user's Instagram page
  const delay = pageState.timing.processingDelay * 1000 || 5000;
  setTimeout(() => {
    window.location.href = `https://www.instagram.com/${pageState.usernames[pageState.currentIndex]}/`;
  }, delay);
}

// Listen for the start processing action from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'clickMessageButton') {
    // Update state from background message
    pageState.selectors = message.data.selectors;
    pageState.message = message.data.message;
    pageState.timing = message.data.timing;
    pageState.usernames = message.data.usernames;
    pageState.currentIndex = message.data.currentIndex || 0;
    pageState.isProcessing = true;

    // Start the message sending process
    clickMessageButton();
  }

  sendResponse({ received: true });
  return true;
});

console.log("TNM UI content script loaded");