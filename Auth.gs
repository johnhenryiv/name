/**
 * Auth.gs
 * Authentication and session management using Google Account identity.
 * All server-side functions must call requireAuth() first.
 */

/**
 * Returns the current user's email from their Google session.
 * Returns null if no active session.
 */
function getActiveEmail() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email || null;
  } catch (e) {
    return null;
  }
}

/**
 * Returns the full user profile object for the currently authenticated user.
 * Returns null if not authenticated or no profile exists yet.
 */
function getCurrentUser() {
  var email = getActiveEmail();
  if (!email) return null;
  return findRow(SHEET_NAMES.USERS, 'email', email);
}

/**
 * Throws an error if no authenticated Google user is present.
 * Call at the top of every server function exposed to the frontend.
 */
function requireAuth() {
  var email = getActiveEmail();
  if (!email) {
    throw new Error('Authentication required. Please sign in with your Google account.');
  }
  return email;
}

/**
 * Checks if the current user has a complete profile.
 * Returns { authenticated, hasProfile, user }
 */
function getAuthStatus() {
  var email = getActiveEmail();
  if (!email) {
    return { authenticated: false, hasProfile: false, user: null };
  }
  var user = findRow(SHEET_NAMES.USERS, 'email', email);
  return {
    authenticated: true,
    hasProfile: !!user && user.active === true,
    user: user
  };
}

/**
 * Verifies that the requesting user owns the given userId.
 * Throws if they do not.
 */
function requireOwnership(userId) {
  var email = requireAuth();
  var user = findRow(SHEET_NAMES.USERS, 'userId', userId);
  if (!user || user.email !== email) {
    throw new Error('Access denied.');
  }
  return user;
}

/**
 * Verifies two users are matched (mutual acceptance) before allowing messaging.
 */
function requireMatchedWith(otherUserId) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Authentication required.');

  var matches = getAllRows(SHEET_NAMES.MATCHES);
  var isMatched = matches.some(function(m) {
    return m.status === 'accepted' && (
      (m.user1Id === currentUser.userId && m.user2Id === otherUserId) ||
      (m.user2Id === currentUser.userId && m.user1Id === otherUserId)
    );
  });

  if (!isMatched) {
    throw new Error('You can only message users you are matched with.');
  }
  return currentUser;
}
