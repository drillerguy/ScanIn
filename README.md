# ScanIn

ScanIn is a mobile-first social UPC check-in game.

Scan a real product barcode, identify the item, post a check-in to your friends, earn points for unique discoveries, and compete on the leaderboard.

## Phase 1

- Email/password sign up and login
- Username, display name, bio, and profile photo
- Live camera barcode scanning
- Scan a barcode from a photo
- Manual UPC/EAN/GTIN entry
- Product lookup with graceful fallback
- Check-ins shared to accepted friends
- 10 points for a user's first check-in of a UPC; repeat check-ins earn 0 points
- Friends and friend requests
- Friends activity feed
- Global signed-in leaderboard
- Installable PWA hosted on GitHub Pages

## Backend

ScanIn uses its own Supabase project for authentication, profile photos, friendships, check-ins, points, and leaderboard data.

## Deployment

GitHub Pages deploys from the included GitHub Actions workflow.
