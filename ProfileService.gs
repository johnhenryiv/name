/**
 * ProfileService.gs
 * CRUD operations for user profiles stored in the Users sheet.
 */

/**
 * Creates a new profile for the currently authenticated user.
 * @param {Object} profileData - Profile fields from the registration form.
 * @returns {Object} The created user profile.
 */
function createProfile(profileData) {
  var email = requireAuth();
  var existing = findRow(SHEET_NAMES.USERS, 'email', email);
  if (existing) throw new Error('Profile already exists. Use updateProfile instead.');

  validateProfileData(profileData);

  var now = new Date().toISOString();
  var user = {
    userId: generateId(),
    email: email,
    displayName: sanitize(profileData.displayName),
    age: parseInt(profileData.age, 10),
    gender: sanitize(profileData.gender),
    sexualOrientation: sanitize(profileData.sexualOrientation),
    location: sanitize(profileData.location),
    bio: sanitize(profileData.bio || ''),
    interests: profileData.interests || [],
    preferences: profileData.preferences || {},
    boundaries: profileData.boundaries || [],
    lookingFor: sanitize(profileData.lookingFor || 'casual'),
    ageRangeMin: parseInt(profileData.ageRangeMin, 10) || 18,
    ageRangeMax: parseInt(profileData.ageRangeMax, 10) || 99,
    photos: profileData.photos || [],
    active: true,
    createdAt: now,
    updatedAt: now
  };

  appendRow(SHEET_NAMES.USERS, user);
  return stripSensitiveFields(user);
}

/**
 * Updates the current user's profile.
 * @param {Object} updates - Fields to update.
 * @returns {Object} Updated profile.
 */
function updateProfile(updates) {
  var email = requireAuth();
  var user = findRow(SHEET_NAMES.USERS, 'email', email);
  if (!user) throw new Error('Profile not found. Create a profile first.');

  var allowedFields = [
    'displayName', 'age', 'gender', 'sexualOrientation', 'location', 'bio',
    'interests', 'preferences', 'boundaries', 'lookingFor',
    'ageRangeMin', 'ageRangeMax', 'photos'
  ];

  var sanitizedUpdates = { updatedAt: new Date().toISOString() };
  allowedFields.forEach(function(field) {
    if (updates[field] !== undefined) {
      if (typeof updates[field] === 'string') {
        sanitizedUpdates[field] = sanitize(updates[field]);
      } else {
        sanitizedUpdates[field] = updates[field];
      }
    }
  });

  if (sanitizedUpdates.age) sanitizedUpdates.age = parseInt(sanitizedUpdates.age, 10);
  if (sanitizedUpdates.ageRangeMin) sanitizedUpdates.ageRangeMin = parseInt(sanitizedUpdates.ageRangeMin, 10);
  if (sanitizedUpdates.ageRangeMax) sanitizedUpdates.ageRangeMax = parseInt(sanitizedUpdates.ageRangeMax, 10);

  updateRow(SHEET_NAMES.USERS, 'email', email, sanitizedUpdates);
  return Object.assign({}, user, sanitizedUpdates);
}

/**
 * Returns the current user's own profile (with all fields).
 */
function getMyProfile() {
  var email = requireAuth();
  var user = findRow(SHEET_NAMES.USERS, 'email', email);
  if (!user) return null;
  return user;
}

/**
 * Returns a public profile by userId. Strips sensitive fields.
 * @param {string} userId
 */
function getProfile(userId) {
  requireAuth();
  var user = findRow(SHEET_NAMES.USERS, 'userId', userId);
  if (!user || !user.active) throw new Error('Profile not found.');
  return stripSensitiveFields(user);
}

/**
 * Soft-deletes the current user's profile by setting active=false.
 */
function deleteProfile() {
  var email = requireAuth();
  var user = findRow(SHEET_NAMES.USERS, 'email', email);
  if (!user) throw new Error('No profile to delete.');
  updateRow(SHEET_NAMES.USERS, 'email', email, { active: false, updatedAt: new Date().toISOString() });
  return { deleted: true };
}

/**
 * Browses active profiles with optional filters.
 * Returns limited public info — full profile visible only after match.
 * @param {Object} filters - Optional: { gender, location, ageMin, ageMax, orientation }
 */
function browseProfiles(filters) {
  var email = requireAuth();
  filters = filters || {};
  var users = getAllRows(SHEET_NAMES.USERS);

  return users
    .filter(function(u) {
      if (!u.active) return false;
      if (u.email === email) return false; // Exclude self
      if (filters.gender && u.gender !== filters.gender) return false;
      if (filters.location && u.location !== filters.location) return false;
      if (filters.ageMin && u.age < parseInt(filters.ageMin, 10)) return false;
      if (filters.ageMax && u.age > parseInt(filters.ageMax, 10)) return false;
      if (filters.orientation && u.sexualOrientation !== filters.orientation) return false;
      return true;
    })
    .map(function(u) { return stripSensitiveFields(u); })
    .slice(0, 50); // Limit browse results
}

// ---- Helpers ----

/**
 * Removes sensitive fields before returning to the client.
 */
function stripSensitiveFields(user) {
  var safe = Object.assign({}, user);
  delete safe.email;
  return safe;
}

/**
 * Basic input validation for profile creation.
 */
function validateProfileData(data) {
  if (!data.displayName || data.displayName.trim().length < 2) {
    throw new Error('Display name must be at least 2 characters.');
  }
  var age = parseInt(data.age, 10);
  if (isNaN(age) || age < 18) {
    throw new Error('You must be 18 or older to use this platform.');
  }
  if (!data.gender) throw new Error('Gender is required.');
  if (!data.location) throw new Error('Location is required.');
}

/**
 * Strips HTML tags and trims whitespace to prevent XSS.
 */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}
