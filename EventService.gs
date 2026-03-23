/**
 * EventService.gs
 * Community events and meetups management.
 * Any authenticated user with a profile can create events and RSVP.
 */

/**
 * Creates a new community event.
 * @param {Object} eventData - { title, description, location, date, maxAttendees }
 */
function createEvent(eventData) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required to create events.');

  if (!eventData.title || eventData.title.trim().length < 3) {
    throw new Error('Event title must be at least 3 characters.');
  }
  if (!eventData.date) throw new Error('Event date is required.');
  var eventDate = new Date(eventData.date);
  if (isNaN(eventDate.getTime())) throw new Error('Invalid event date.');
  if (eventDate < new Date()) throw new Error('Event date must be in the future.');

  var event = {
    eventId: generateId(),
    title: sanitize(eventData.title),
    description: sanitize(eventData.description || ''),
    location: sanitize(eventData.location || 'TBD'),
    date: eventDate.toISOString(),
    createdBy: currentUser.userId,
    attendees: [currentUser.userId], // Creator auto-RSVPs
    maxAttendees: parseInt(eventData.maxAttendees, 10) || 50,
    createdAt: new Date().toISOString()
  };

  appendRow(SHEET_NAMES.EVENTS, event);
  return event;
}

/**
 * Returns all upcoming events (date >= now), sorted chronologically.
 */
function listEvents() {
  requireAuth();
  var events = getAllRows(SHEET_NAMES.EVENTS);
  var now = new Date();

  return events
    .filter(function(e) { return new Date(e.date) >= now; })
    .sort(function(a, b) { return new Date(a.date) - new Date(b.date); })
    .map(function(e) {
      return {
        eventId: e.eventId,
        title: e.title,
        description: e.description,
        location: e.location,
        date: e.date,
        attendeeCount: toArray(e.attendees).length,
        maxAttendees: e.maxAttendees,
        isFull: toArray(e.attendees).length >= e.maxAttendees
      };
    });
}

/**
 * Returns full details for a single event.
 * @param {string} eventId
 */
function getEventDetails(eventId) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var event = findRow(SHEET_NAMES.EVENTS, 'eventId', eventId);
  if (!event) throw new Error('Event not found.');

  var attendees = toArray(event.attendees);
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description,
    location: event.location,
    date: event.date,
    attendeeCount: attendees.length,
    maxAttendees: event.maxAttendees,
    isAttending: attendees.indexOf(currentUser.userId) !== -1,
    isFull: attendees.length >= event.maxAttendees,
    createdAt: event.createdAt
  };
}

/**
 * Adds the current user to an event's attendee list.
 * @param {string} eventId
 */
function rsvpEvent(eventId) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var event = findRow(SHEET_NAMES.EVENTS, 'eventId', eventId);
  if (!event) throw new Error('Event not found.');

  var attendees = toArray(event.attendees);
  if (attendees.indexOf(currentUser.userId) !== -1) {
    throw new Error('You have already RSVP\'d to this event.');
  }
  if (attendees.length >= event.maxAttendees) {
    throw new Error('This event is full.');
  }
  if (new Date(event.date) < new Date()) {
    throw new Error('Cannot RSVP to a past event.');
  }

  attendees.push(currentUser.userId);
  updateRow(SHEET_NAMES.EVENTS, 'eventId', eventId, { attendees: attendees });

  return { eventId: eventId, attending: true, attendeeCount: attendees.length };
}

/**
 * Removes the current user from an event's attendee list.
 * @param {string} eventId
 */
function cancelRsvp(eventId) {
  var currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Profile required.');

  var event = findRow(SHEET_NAMES.EVENTS, 'eventId', eventId);
  if (!event) throw new Error('Event not found.');

  var attendees = toArray(event.attendees);
  var idx = attendees.indexOf(currentUser.userId);
  if (idx === -1) throw new Error('You are not attending this event.');

  attendees.splice(idx, 1);
  updateRow(SHEET_NAMES.EVENTS, 'eventId', eventId, { attendees: attendees });

  return { eventId: eventId, attending: false, attendeeCount: attendees.length };
}

/**
 * Returns all resources, optionally filtered by category.
 * @param {string} [category] - Optional category filter
 */
function getResources(category) {
  requireAuth();
  var resources = getAllRows(SHEET_NAMES.RESOURCES);
  if (category) {
    resources = resources.filter(function(r) {
      return r.category && r.category.toLowerCase() === category.toLowerCase();
    });
  }
  return resources;
}
