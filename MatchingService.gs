/**
 * MatchingService.gs
 * Compatibility scoring and match management.
 *
 * Scoring breakdown (max 100 points):
 *  - Interests overlap (Jaccard similarity): 30 pts
 *  - Location match (same city):             25 pts
 *  - Age range compatibility (mutual):        20 pts
 *  - Sexual orientation compatibility:        15 pts
 *  - LookingFor alignment:                    10 pts
 */

/**
 * Scores all active users against the current user and stores top matches
 * in the Matches sheet. Returns the top 20 candidates with scores.
 * @returns {Array} Array of match objects with score and candidate profile.
 */
function generateMatches() {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required. Create your profile first.');

  var allUsers = getAllRows(SHEET_NAMES.USERS);
  var existingMatches = getAllRows(SHEET_NAMES.MATCHES);

  // Build set of already-matched user IDs (any status)
  var alreadyMatched = {};
  existingMatches.forEach(function(m) {
    if (m.user1Id === currentUser.userId) alreadyMatched[m.user2Id] = true;
    if (m.user2Id === currentUser.userId) alreadyMatched[m.user1Id] = true;
  });

  var candidates = allUsers.filter(function(u) {
    return u.active &&
      u.userId !== currentUser.userId &&
      !alreadyMatched[u.userId];
  });

  // Score each candidate
  var scored = candidates.map(function(candidate) {
    return {
      user: candidate,
      score: computeMatchScore(currentUser, candidate)
    };
  });

  // Sort by score descending, take top 20
  scored.sort(function(a, b) { return b.score - a.score; });
  var top = scored.slice(0, 20);

  // Persist matches to sheet
  var now = new Date().toISOString();
  top.forEach(function(item) {
    var match = {
      matchId: generateId(),
      user1Id: currentUser.userId,
      user2Id: item.user.userId,
      score: item.score,
      status: 'pending',
      createdAt: now
    };
    appendRow(SHEET_NAMES.MATCHES, match);
    item.matchId = match.matchId;
  });

  return top.map(function(item) {
    return {
      matchId: item.matchId,
      score: item.score,
      candidate: stripSensitiveFields(item.user)
    };
  });
}

/**
 * Returns all pending (un-responded) matches for the current user.
 * These are matches where user2Id = currentUser (sent to them by others).
 */
function getPendingMatches() {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var matches = getAllRows(SHEET_NAMES.MATCHES);
  var pending = matches.filter(function(m) {
    return m.user2Id === currentUser.userId && m.status === 'pending';
  });

  return pending.map(function(m) {
    var sender = findRow(SHEET_NAMES.USERS, 'userId', m.user1Id);
    return {
      matchId: m.matchId,
      score: m.score,
      candidate: sender ? stripSensitiveFields(sender) : null,
      createdAt: m.createdAt
    };
  });
}

/**
 * Accepts or rejects a match.
 * @param {string} matchId
 * @param {boolean} accept - true to accept, false to reject
 */
function respondToMatch(matchId, accept) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var match = findRow(SHEET_NAMES.MATCHES, 'matchId', matchId);
  if (!match) throw new Error('Match not found.');
  if (match.user2Id !== currentUser.userId) throw new Error('Access denied.');
  if (match.status !== 'pending') throw new Error('Match already responded to.');

  var newStatus = accept ? 'accepted' : 'rejected';
  updateRow(SHEET_NAMES.MATCHES, 'matchId', matchId, { status: newStatus });

  return { matchId: matchId, status: newStatus };
}

/**
 * Returns all accepted (mutual) matches for the current user.
 */
function getMyMatches() {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var matches = getAllRows(SHEET_NAMES.MATCHES);
  var accepted = matches.filter(function(m) {
    return m.status === 'accepted' && (
      m.user1Id === currentUser.userId || m.user2Id === currentUser.userId
    );
  });

  return accepted.map(function(m) {
    var otherId = m.user1Id === currentUser.userId ? m.user2Id : m.user1Id;
    var other = findRow(SHEET_NAMES.USERS, 'userId', otherId);
    return {
      matchId: m.matchId,
      score: m.score,
      matchedAt: m.createdAt,
      partner: other ? stripSensitiveFields(other) : null
    };
  });
}

// ---- Scoring Algorithm ----

/**
 * Computes a 0-100 compatibility score between two users.
 */
function computeMatchScore(u1, u2) {
  var score = 0;

  // 1. Interests overlap — Jaccard similarity (30 pts)
  var i1 = toArray(u1.interests);
  var i2 = toArray(u2.interests);
  if (i1.length > 0 || i2.length > 0) {
    var inter = intersection(i1, i2);
    var uni = union(i1, i2);
    score += (uni.length > 0 ? inter.length / uni.length : 0) * 30;
  }

  // 2. Location match — same city string (25 pts)
  if (u1.location && u2.location &&
      u1.location.toLowerCase().trim() === u2.location.toLowerCase().trim()) {
    score += 25;
  }

  // 3. Age range mutual compatibility (20 pts)
  var ageMin1 = parseInt(u1.ageRangeMin, 10) || 18;
  var ageMax1 = parseInt(u1.ageRangeMax, 10) || 99;
  var ageMin2 = parseInt(u2.ageRangeMin, 10) || 18;
  var ageMax2 = parseInt(u2.ageRangeMax, 10) || 99;
  var age1 = parseInt(u1.age, 10);
  var age2 = parseInt(u2.age, 10);
  var ageOk = age1 >= ageMin2 && age1 <= ageMax2 && age2 >= ageMin1 && age2 <= ageMax1;
  if (ageOk) score += 20;

  // 4. Sexual orientation compatibility (15 pts)
  if (orientationsCompatible(u1.gender, u1.sexualOrientation, u2.gender, u2.sexualOrientation)) {
    score += 15;
  }

  // 5. LookingFor alignment (10 pts)
  if (u1.lookingFor && u2.lookingFor && u1.lookingFor === u2.lookingFor) {
    score += 10;
  }

  return Math.round(score);
}

/**
 * Determines if two people's orientation and gender combination is compatible.
 */
function orientationsCompatible(g1, o1, g2, o2) {
  // Bisexual / pansexual are compatible with anyone
  var open = ['bisexual', 'pansexual', 'queer', 'fluid'];
  if (open.indexOf((o1 || '').toLowerCase()) !== -1) return true;
  if (open.indexOf((o2 || '').toLowerCase()) !== -1) return true;

  // Straight: attracted to opposite gender
  var g1l = (g1 || '').toLowerCase();
  var g2l = (g2 || '').toLowerCase();
  var o1l = (o1 || '').toLowerCase();
  var o2l = (o2 || '').toLowerCase();

  if (o1l === 'straight' || o1l === 'heterosexual') {
    if (g1l === 'male' && g2l !== 'female') return false;
    if (g1l === 'female' && g2l !== 'male') return false;
  }
  if (o2l === 'straight' || o2l === 'heterosexual') {
    if (g2l === 'male' && g1l !== 'female') return false;
    if (g2l === 'female' && g1l !== 'male') return false;
  }

  // Gay / lesbian: attracted to same gender
  if (o1l === 'gay' || o1l === 'lesbian' || o1l === 'homosexual') {
    if (g1l !== g2l) return false;
  }
  if (o2l === 'gay' || o2l === 'lesbian' || o2l === 'homosexual') {
    if (g2l !== g1l) return false;
  }

  return true;
}

// ---- Array Helpers ----

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return []; }
  }
  return [];
}

function intersection(a, b) {
  var bSet = b.map(function(x) { return x.toString().toLowerCase(); });
  return a.filter(function(x) { return bSet.indexOf(x.toString().toLowerCase()) !== -1; });
}

function union(a, b) {
  var result = a.slice();
  b.forEach(function(x) {
    var xl = x.toString().toLowerCase();
    if (!result.some(function(r) { return r.toString().toLowerCase() === xl; })) {
      result.push(x);
    }
  });
  return result;
}
