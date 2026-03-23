/**
 * MessagingService.gs
 * Sheet-based messaging between matched users.
 * Only users with an accepted match may exchange messages.
 */

/**
 * Sends a message to another user.
 * Enforces that sender and receiver are matched before allowing messages.
 * @param {string} receiverId - userId of the recipient
 * @param {string} content - Message text
 */
function sendMessage(receiverId, content) {
  var currentUser = requireMatchedWith(receiverId);

  content = sanitize(content);
  if (!content || content.length === 0) throw new Error('Message cannot be empty.');
  if (content.length > 2000) throw new Error('Message too long (max 2000 characters).');

  var message = {
    messageId: generateId(),
    senderId: currentUser.userId,
    receiverId: receiverId,
    content: content,
    timestamp: new Date().toISOString(),
    read: false
  };

  appendRow(SHEET_NAMES.MESSAGES, message);
  return message;
}

/**
 * Returns all messages between the current user and another user,
 * sorted chronologically. Marks received messages as read.
 * @param {string} otherUserId
 */
function getConversation(otherUserId) {
  var currentUser = requireMatchedWith(otherUserId);
  var allMessages = getAllRows(SHEET_NAMES.MESSAGES);

  var conversation = allMessages.filter(function(m) {
    return (m.senderId === currentUser.userId && m.receiverId === otherUserId) ||
           (m.senderId === otherUserId && m.receiverId === currentUser.userId);
  });

  // Sort by timestamp ascending
  conversation.sort(function(a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });

  // Mark unread received messages as read
  conversation.forEach(function(m) {
    if (m.receiverId === currentUser.userId && m.read === false) {
      updateRow(SHEET_NAMES.MESSAGES, 'messageId', m.messageId, { read: true });
      m.read = true;
    }
  });

  return conversation;
}

/**
 * Returns inbox summary: one entry per conversation with the latest message
 * and unread count.
 */
function getInbox() {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var allMessages = getAllRows(SHEET_NAMES.MESSAGES);

  // Group messages by conversation partner
  var conversations = {};
  allMessages.forEach(function(m) {
    if (m.senderId !== currentUser.userId && m.receiverId !== currentUser.userId) return;
    var partnerId = m.senderId === currentUser.userId ? m.receiverId : m.senderId;
    if (!conversations[partnerId]) {
      conversations[partnerId] = { messages: [], unread: 0 };
    }
    conversations[partnerId].messages.push(m);
    if (m.receiverId === currentUser.userId && !m.read) {
      conversations[partnerId].unread++;
    }
  });

  return Object.keys(conversations).map(function(partnerId) {
    var msgs = conversations[partnerId].messages;
    msgs.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    var latest = msgs[0];
    var partner = findRow(SHEET_NAMES.USERS, 'userId', partnerId);
    return {
      partnerId: partnerId,
      partnerName: partner ? partner.displayName : 'Unknown',
      latestMessage: latest.content,
      latestTimestamp: latest.timestamp,
      unreadCount: conversations[partnerId].unread
    };
  }).sort(function(a, b) {
    return new Date(b.latestTimestamp) - new Date(a.latestTimestamp);
  });
}

/**
 * Marks a specific message as read.
 * @param {string} messageId
 */
function markRead(messageId) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var message = findRow(SHEET_NAMES.MESSAGES, 'messageId', messageId);
  if (!message) throw new Error('Message not found.');
  if (message.receiverId !== currentUser.userId) throw new Error('Access denied.');

  updateRow(SHEET_NAMES.MESSAGES, 'messageId', messageId, { read: true });
  return { messageId: messageId, read: true };
}
