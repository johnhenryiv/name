/**
 * SheetSetup.gs
 * Initializes the Google Sheets database for the FWB Connection Platform.
 * Run initializeDatabase() once from the Apps Script editor before deploying.
 */

var SHEET_NAMES = {
  USERS: 'Users',
  MATCHES: 'Matches',
  MESSAGES: 'Messages',
  RATINGS: 'Ratings',
  EVENTS: 'Events',
  RESOURCES: 'Resources'
};

var HEADERS = {
  Users: [
    'userId', 'email', 'displayName', 'age', 'gender', 'sexualOrientation',
    'location', 'bio', 'interests', 'preferences', 'boundaries',
    'lookingFor', 'ageRangeMin', 'ageRangeMax', 'photos', 'active',
    'createdAt', 'updatedAt'
  ],
  Matches: [
    'matchId', 'user1Id', 'user2Id', 'score', 'status', 'createdAt'
  ],
  Messages: [
    'messageId', 'senderId', 'receiverId', 'content', 'timestamp', 'read'
  ],
  Ratings: [
    'ratingId', 'raterId', 'rateeId', 'score', 'comment', 'anonymous', 'createdAt'
  ],
  Events: [
    'eventId', 'title', 'description', 'location', 'date',
    'createdBy', 'attendees', 'maxAttendees', 'createdAt'
  ],
  Resources: [
    'resourceId', 'title', 'category', 'content', 'docUrl', 'createdAt'
  ]
};

/**
 * Creates the spreadsheet and all sheets with headers.
 * Stores the spreadsheet ID in Script Properties.
 * Run this once before deploying.
 */
function initializeDatabase() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SPREADSHEET_ID');
  var ss;

  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
      Logger.log('Using existing spreadsheet: ' + ss.getName());
    } catch (e) {
      Logger.log('Existing spreadsheet not found. Creating new one.');
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('FWB Connection Platform DB');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('Created new spreadsheet with ID: ' + ss.getId());
  }

  // Create or verify each sheet
  Object.keys(HEADERS).forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      Logger.log('Created sheet: ' + sheetName);
    }
    // Set header row if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[sheetName]);
      sheet.getRange(1, 1, 1, HEADERS[sheetName].length)
        .setFontWeight('bold')
        .setBackground('#4a4a8a')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });

  // Remove default 'Sheet1' if present
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // Seed default resources
  seedResources(ss);

  Logger.log('Database initialization complete.');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
}

/**
 * Returns the main spreadsheet. Throws if not initialized.
 */
function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error('Database not initialized. Run initializeDatabase() first.');
  }
  return SpreadsheetApp.openById(ssId);
}

/**
 * Returns a specific sheet by name.
 */
function getSheet(sheetName) {
  return getSpreadsheet().getSheetByName(sheetName);
}

/**
 * Reads all data rows from a sheet as an array of objects.
 * Row 1 is treated as headers.
 */
function getAllRows(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      var val = row[i];
      // Parse JSON fields
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try { val = JSON.parse(val); } catch (e) {}
      }
      obj[header] = val;
    });
    return obj;
  });
}

/**
 * Appends a new row to a sheet from an object.
 */
function appendRow(sheetName, obj) {
  var sheet = getSheet(sheetName);
  var headers = HEADERS[sheetName];
  var row = headers.map(function(h) {
    var val = obj[h];
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  });
  sheet.appendRow(row);
}

/**
 * Updates a row in a sheet by matching a key column value.
 */
function updateRow(sheetName, keyColumn, keyValue, updates) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyIdx = headers.indexOf(keyColumn);
  if (keyIdx === -1) throw new Error('Column not found: ' + keyColumn);

  for (var i = 1; i < data.length; i++) {
    if (data[i][keyIdx] == keyValue) {
      Object.keys(updates).forEach(function(key) {
        var colIdx = headers.indexOf(key);
        if (colIdx !== -1) {
          var val = updates[key];
          if (typeof val === 'object') val = JSON.stringify(val);
          sheet.getRange(i + 1, colIdx + 1).setValue(val);
        }
      });
      return true;
    }
  }
  return false;
}

/**
 * Finds a single row matching a key column value.
 */
function findRow(sheetName, keyColumn, keyValue) {
  var rows = getAllRows(sheetName);
  return rows.find(function(r) { return r[keyColumn] == keyValue; }) || null;
}

/**
 * Generates a unique ID.
 */
function generateId() {
  return Utilities.getUuid();
}

/**
 * Seeds default educational resources into the Resources sheet.
 */
function seedResources(ss) {
  var sheet = ss.getSheetByName('Resources');
  if (sheet.getLastRow() > 1) return; // Already seeded

  var resources = [
    {
      resourceId: generateId(),
      title: 'Safe Sex Basics: A Comprehensive Guide',
      category: 'Safe Sex',
      content: 'Comprehensive guide covering contraception methods, STI prevention, barrier methods, and regular testing recommendations.',
      docUrl: '',
      createdAt: new Date().toISOString()
    },
    {
      resourceId: generateId(),
      title: 'Open Communication in FWB Relationships',
      category: 'Communication',
      content: 'How to clearly communicate your boundaries, expectations, and desires to ensure mutually satisfying arrangements.',
      docUrl: '',
      createdAt: new Date().toISOString()
    },
    {
      resourceId: generateId(),
      title: 'Understanding Consent',
      category: 'Consent',
      content: 'A guide to affirmative, ongoing, and enthusiastic consent. Covers how to ask for and give consent clearly.',
      docUrl: '',
      createdAt: new Date().toISOString()
    },
    {
      resourceId: generateId(),
      title: 'Setting Boundaries in Casual Relationships',
      category: 'Boundaries',
      content: 'Practical advice on identifying your personal boundaries, communicating them, and respecting partners\' boundaries.',
      docUrl: '',
      createdAt: new Date().toISOString()
    },
    {
      resourceId: generateId(),
      title: 'STI Testing: When and How Often',
      category: 'Safe Sex',
      content: 'Recommended testing frequencies, types of tests available, and where to get tested confidentially.',
      docUrl: '',
      createdAt: new Date().toISOString()
    },
    {
      resourceId: generateId(),
      title: 'Emotional Wellbeing in FWB Arrangements',
      category: 'Wellbeing',
      content: 'Tips for maintaining emotional health, recognizing changing feelings, and knowing when to reassess an arrangement.',
      docUrl: '',
      createdAt: new Date().toISOString()
    }
  ];

  resources.forEach(function(r) {
    appendRow('Resources', r);
  });
  Logger.log('Seeded ' + resources.length + ' resources.');
}
