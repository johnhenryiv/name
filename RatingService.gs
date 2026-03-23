/**
 * RatingService.gs
 * Rating and review system for accountability and transparency.
 * Users can rate matched partners after an interaction.
 * Supports anonymous reviews.
 */

/**
 * Submits a rating for another user.
 * Can only rate someone you have been matched with.
 * @param {string} rateeId - userId of the person being rated
 * @param {number} score - Integer 1-5
 * @param {string} comment - Optional review text
 * @param {boolean} anonymous - If true, hides rater identity
 */
function submitRating(rateeId, score, comment, anonymous) {
  var currentUser = requireMatchedWith(rateeId);

  score = parseInt(score, 10);
  if (isNaN(score) || score < 1 || score > 5) {
    throw new Error('Score must be a whole number between 1 and 5.');
  }

  comment = comment ? sanitize(comment) : '';
  if (comment.length > 500) throw new Error('Comment too long (max 500 characters).');

  // Prevent duplicate rating for the same match.
  // Always store the real userId in raterId for deduplication;
  // the anonymous flag controls whether the identity is shown publicly.
  var existing = getAllRows(SHEET_NAMES.RATINGS).find(function(r) {
    return r.raterId === currentUser.userId && r.rateeId === rateeId;
  });
  if (existing) throw new Error('You have already rated this user.');

  var rating = {
    ratingId: generateId(),
    raterId: currentUser.userId,
    rateeId: rateeId,
    score: score,
    comment: comment,
    anonymous: !!anonymous,
    createdAt: new Date().toISOString()
  };

  appendRow(SHEET_NAMES.RATINGS, rating);
  return { ratingId: rating.ratingId, score: score };
}

/**
 * Returns all public ratings for a given user, plus their average score.
 * Hides rater identity for anonymous reviews.
 * @param {string} userId
 */
function getRatingsForUser(userId) {
  requireAuth();
  var ratings = getAllRows(SHEET_NAMES.RATINGS);

  var userRatings = ratings.filter(function(r) { return r.rateeId === userId; });

  var avg = userRatings.length > 0
    ? userRatings.reduce(function(sum, r) { return sum + parseInt(r.score, 10); }, 0) / userRatings.length
    : null;

  var publicRatings = userRatings.map(function(r) {
    var rater = null;
    if (!r.anonymous) {
      var raterUser = findRow(SHEET_NAMES.USERS, 'userId', r.raterId);
      rater = raterUser ? raterUser.displayName : 'Unknown';
    }
    return {
      ratingId: r.ratingId,
      score: r.score,
      comment: r.comment,
      anonymous: r.anonymous,
      raterName: rater,
      createdAt: r.createdAt
    };
  });

  // Sort newest first
  publicRatings.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

  return {
    averageScore: avg ? Math.round(avg * 10) / 10 : null,
    totalRatings: userRatings.length,
    ratings: publicRatings
  };
}

/**
 * Returns ratings the current user has received (their own ratings).
 */
function getMyRatings() {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');
  return getRatingsForUser(currentUser.userId);
}
