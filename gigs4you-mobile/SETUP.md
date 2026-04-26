# Gigs4You Mobile — Setup Guide

## Prerequisites
- Flutter 3.41.5
- Android Studio with emulator SDK
- Running Gigs4You API (see `gigs4you-api/README.md`)

## Quick start

```bash
# Install dependencies
flutter pub get

# Run on emulator
flutter run -d emulator-5554 --debug

# Run on physical device
flutter run --release
```

## Configure API URL

Edit `lib/core/api/api_client.dart` — find the `_baseUrl` constant:
```dart
// For emulator (Android):
static const _baseUrl = 'http://10.0.2.2:3000/api/v1';

// For physical device (replace with your computer's local IP):
static const _baseUrl = 'http://192.168.1.100:3000/api/v1';

// For production:
static const _baseUrl = 'https://api.gigs4you.app/api/v1';
```

## Firebase Push Notifications

1. Create a Firebase project at console.firebase.google.com
2. Add an Android app with package name `com.gigs4you.app`
3. Download `google-services.json` and place it in `android/app/`
4. Set `FCM_SERVICE_ACCOUNT_JSON` in the API `.env`

The app will automatically register the FCM token with the API on login.

## Building for Play Store

```bash
# Generate release keystore (one time)
keytool -genkey -v -keystore android/app/gigs4you.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 -alias gigs4you

# Create android/key.properties:
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=gigs4you
storeFile=gigs4you.keystore

# Build APK
flutter build apk --release

# Build App Bundle (recommended for Play Store)
flutter build appbundle --release
```

## Android Gradle versions (do not change)
- AGP: 8.9.1
- Kotlin: 2.1.0
- Gradle: 8.11.1
