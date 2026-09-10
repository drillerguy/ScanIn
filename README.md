# ScanIn

ScanIn is a mobile-first social UPC check-in game.

Scan a real product barcode, identify the item, then separately check in at the place where you're having it. Friends can see what you're drinking and where, while unique UPC discoveries earn points toward the leaderboard.

## Phase 1

- Email/password sign up and login
- Username, display name, bio, and profile photo
- Live camera barcode scanning
- Scan a barcode from a photo
- Manual UPC/EAN/GTIN entry
- Product lookup with graceful fallback
- Separate Scan and Check In actions
- Optional current-location detection when checking in
- Venue labels such as Applebee's, a bar, a friend's place, or Home
- General city/area shown with location-aware check-ins; home street addresses are not displayed
- Check-ins shared to the user and accepted friends
- 10 points for a user's first check-in of a UPC; repeat check-ins earn 0 points
- Friends and friend requests
- Friends activity feed with check-in locations
- Global signed-in leaderboard
- Installable PWA hosted on GitHub Pages

## Backend

ScanIn uses its own Supabase project for authentication, profile photos, friendships, check-ins, approximate location data, points, and leaderboard data. Row-level security limits check-in visibility to the user and accepted friends.

## Deployment

GitHub Pages deploys from the `main` branch. JavaScript syntax is validated on updates with GitHub Actions.
