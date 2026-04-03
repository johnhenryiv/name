# FWB Connect — Google Apps Script Platform

A safe, discreet friends-with-benefits connection platform built entirely with Google Workspace tools (Google Sheets + Google Apps Script).

## Features

- **Smart Matching**: Compatibility scoring based on interests, location, age range, and orientation
- **Private Messaging**: Real-time chat between matched users
- **Rating System**: Anonymous reviews and ratings for accountability
- **Community Events**: Create and RSVP to exclusive meetups
- **Safe Sex Resources**: Educational materials on consent, communication, and health
- **Privacy First**: Email never shared, authentication via Google, no ads

## Tech Stack

- **Backend**: Google Apps Script (JavaScript)
- **Database**: Google Sheets (6 linked sheets)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Deployment**: Google Apps Script Web App

## Quick Start

### Prerequisites

- A Google Account with Apps Script API enabled
- Node.js + npm
- `clasp` CLI: `npm install -g @google/clasp`

### Setup (5 minutes)

```bash
# 1. Clone repo (or create locally)
git clone https://github.com/YOUR_USERNAME/fwb-connect.git
cd fwb-connect

# 2. Authenticate
clasp login

# 3. Push code
clasp push

# 4. Initialize database (in Apps Script editor)
# - Go to script.google.com → open project
# - Run initializeDatabase() → wait for completion

# 5. Deploy as Web App
# - Apps Script editor: Deploy → New deployment → Web app
# - Execute as: User accessing the web app
# - Who has access: Anyone with Google Account
# - Copy URL and share!
```

## Architecture

**Backend** (`*.gs` files):
- `SheetSetup.gs` — Database init (6 sheets)
- `Auth.gs` — Google OAuth authentication
- `Code.gs` — Web app router & dispatcher
- `ProfileService.gs` — User profiles CRUD
- `MatchingService.gs` — Matching algorithm (100-pt scoring)
- `MessagingService.gs` — Private messages
- `RatingService.gs` — Reviews & ratings
- `EventService.gs` — Events & RSVPs

**Frontend** (`*.html` files):
- `index.html` — Dashboard
- `profile.html` — 4-step profile builder
- `matches.html` — Match discovery & ratings
- `messages.html` — Chat interface
- `events.html` — Events & RSVP
- `resources.html` — Safe sex education
- `styles.html` — Shared CSS

**Database** (Google Sheets):
- `Users` — Profiles, preferences, boundaries
- `Matches` — Compatibility scores, status
- `Messages` — Private messages
- `Ratings` — Anonymous reviews
- `Events` — Community meetups
- `Resources` — Educational content

## Matching Algorithm

Compatibility score (0-100):
- Interests overlap (Jaccard): 30 pts
- Location match: 25 pts
- Age range compatibility: 20 pts
- Orientation match: 15 pts
- LookingFor alignment: 10 pts

Minimum threshold: 60 pts

## Security & Privacy

✅ Emails **never** shared  
✅ Google OAuth authentication  
✅ XSS sanitization on all inputs  
✅ Messages only between matched users  
✅ Anonymous rating option  
✅ Soft-delete (no permanent removal)

## Deployment

- **Execute as**: User accessing the web app
- **Access**: Anyone with Google Account
- **Scopes**: `script.deployments`, `script.projects`, `script.webapp.deploy`, `spreadsheets`, `drive`

## Future Enhancements

- [ ] Profile photos (Google Drive)
- [ ] Event calendar (Google Calendar)
- [ ] Email notifications
- [ ] Geolocation matching
- [ ] Mobile app
- [ ] Cloud Firestore for scale
- [ ] Moderation tools

## License

MIT

---

**Need help?** Open a GitHub issue.