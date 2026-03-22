/**
 * Code.gs
 * Web app entry point. Handles routing and serves HTML pages.
 * Deploy as a Web App: Execute as "User accessing the web app".
 *
 * HOW TO DEPLOY:
 * 1. Run initializeDatabase() once from the editor.
 * 2. Click Deploy > New deployment > Web app.
 * 3. Set "Execute as" = User accessing the web app.
 * 4. Set "Who has access" = Anyone with Google Account.
 * 5. Share the deployment URL.
 */

/**
 * Main entry point for GET requests.
 * Routes to the appropriate HTML page based on the ?page= parameter.
 */
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'index';
  var validPages = ['index', 'profile', 'matches', 'messages', 'events', 'resources'];

  if (validPages.indexOf(page) === -1) page = 'index';

  var template = HtmlService.createTemplateFromFile(page);
  template.page = page;

  return template.evaluate()
    .setTitle('FWB Connect')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Helper used in HTML templates to include other HTML files.
 * Usage in HTML: <?!= include('styles') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns the base URL of this web app for constructing navigation links.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Master server function called from the frontend.
 * Dispatches to the appropriate service function.
 * All public API functions are routed through here for centralized auth.
 *
 * @param {string} action - The function name to call
 * @param {Object} params - Parameters to pass to the function
 * @returns {Object} { success, data, error }
 */
function serverCall(action, params) {
  try {
    requireAuth();
    var result = dispatchAction(action, params || {});
    return { success: true, data: result };
  } catch (e) {
    Logger.log('serverCall error [' + action + ']: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Dispatches an action string to the appropriate service function.
 */
function dispatchAction(action, params) {
  var actions = {
    // Auth
    'getAuthStatus': function() { return getAuthStatus(); },

    // Profile
    'createProfile': function() { return createProfile(params); },
    'updateProfile': function() { return updateProfile(params); },
    'getMyProfile': function() { return getMyProfile(); },
    'getProfile': function() { return getProfile(params.userId); },
    'browseProfiles': function() { return browseProfiles(params); },
    'deleteProfile': function() { return deleteProfile(); },

    // Matching
    'generateMatches': function() { return generateMatches(); },
    'getMyMatches': function() { return getMyMatches(); },
    'respondToMatch': function() { return respondToMatch(params.matchId, params.accept); },
    'getPendingMatches': function() { return getPendingMatches(); },

    // Messaging
    'sendMessage': function() { return sendMessage(params.receiverId, params.content); },
    'getConversation': function() { return getConversation(params.otherUserId); },
    'getInbox': function() { return getInbox(); },
    'markRead': function() { return markRead(params.messageId); },

    // Ratings
    'submitRating': function() { return submitRating(params.rateeId, params.score, params.comment, params.anonymous); },
    'getRatingsForUser': function() { return getRatingsForUser(params.userId); },
    'getMyRatings': function() { return getMyRatings(); },

    // Events
    'createEvent': function() { return createEvent(params); },
    'listEvents': function() { return listEvents(); },
    'rsvpEvent': function() { return rsvpEvent(params.eventId); },
    'cancelRsvp': function() { return cancelRsvp(params.eventId); },
    'getEventDetails': function() { return getEventDetails(params.eventId); },

    // Resources
    'getResources': function() { return getResources(params.category); }
  };

  if (!actions[action]) {
    throw new Error('Unknown action: ' + action);
  }
  return actions[action]();
}
