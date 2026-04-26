# Gigs4You — Flutter Mobile App

## Prerequisites
Make sure these are done first:
- Flutter SDK installed and `flutter doctor` shows green
- Android Studio installed with Android SDK 33+
- An emulator running (Pixel 6, API 33) OR real Android phone connected via USB
- Gigs4You NestJS API running (`npm run start:dev` in the api folder)

---

## Setup

### 1. Install dependencies
```powershell
cd gigs4you-mobile
flutter pub get
```

### 2. Set the API URL
Open `lib/core/api/api_client.dart` and check the base URL:

```dart
// For Android EMULATOR (default):
static const _baseUrl = 'http://10.0.2.2:3000/api/v1';

// For REAL PHONE on same WiFi — replace with your PC's local IP:
static const _baseUrl = 'http://192.168.1.XXX:3000/api/v1';
```

To find your PC's IP on Windows:
```powershell
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
```

### 3. Google Maps (optional for now)
The app works without a Maps API key — maps just won't render.
To enable maps:
1. Go to console.cloud.google.com
2. Create a project → Enable "Maps SDK for Android"
3. Create an API key
4. Paste it in `android/app/src/main/AndroidManifest.xml` where it says `YOUR_GOOGLE_MAPS_API_KEY`

---

## Run the app

```powershell
# List available devices (emulator or phone)
flutter devices

# Run on emulator
flutter run

# Run in release mode (faster)
flutter run --release

# Build APK to install on phone
flutter build apk --release
# APK will be at: build/app/outputs/flutter-apk/app-release.apk
```

---

## Project structure

```
lib/
├── main.dart                    # App entry, theme, routing, providers
├── core/
│   ├── api/
│   │   └── api_client.dart      # All HTTP calls to NestJS API
│   ├── models/
│   │   └── task.dart            # Task + Agent data models
│   └── storage/
│       └── auth_storage.dart    # Secure JWT token storage
└── features/
    ├── auth/
    │   ├── auth_provider.dart   # Login/logout state
    │   └── login_screen.dart    # Login UI
    ├── home/
    │   ├── home_screen.dart     # Bottom nav shell
    │   └── dashboard_tab.dart   # Home tab (check-in, metrics)
    ├── tasks/
    │   ├── tasks_provider.dart  # Task list state
    │   └── tasks_tab.dart       # Tasks UI + complete flow
    ├── gps/
    │   └── gps_provider.dart    # Live GPS streaming
    └── profile/
        ├── profile_provider.dart # Agent profile + check-in/out
        └── profile_tab.dart      # XP, streak, leaderboard
```

---

## Test flow

1. Start the NestJS API: `npm run start:dev` in `/gigs4you-api`
2. Start Docker: `docker compose up -d` in `/gigs4you`
3. Register a test user via Postman or Swagger (`http://localhost:3000/docs`)
4. Run the Flutter app: `flutter run`
5. Login with the phone + password you registered
6. The home screen shows check-in button, tasks, metrics
7. Check in → tasks for today appear → tap a task → complete it → XP awarded

---

## Common issues on Windows

**"Unable to locate Android SDK"**
→ Open Android Studio → SDK Manager → note the SDK path → run:
```powershell
flutter config --android-sdk "C:\Users\YOU\AppData\Local\Android\Sdk"
```

**"Connection refused" (app can't reach API)**
→ Make sure API is running (`npm run start:dev`)
→ For emulator, URL must be `http://10.0.2.2:3000` not `localhost`
→ For real phone, use your PC's WiFi IP

**"Gradle build failed"**
→ Run in Android Studio terminal:
```powershell
cd android
.\gradlew clean
cd ..
flutter run
```
