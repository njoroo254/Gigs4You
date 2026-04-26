import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/storage/auth_storage.dart';

class AuthProvider extends ChangeNotifier {
  final ApiClient _api;
  final _storage = AuthStorage();

  AppUser? user;
  bool loading = false;
  String? error;

  AuthProvider(this._api);

  Future<Map<String, dynamic>?> login(String phone, String password) async {
    return loginWithIdentifier(phone, password);
  }

  /// Returns:
  /// - `null`  on error (check `error` property)
  /// - `{ 'requiresVerification': true, 'verificationToken': ..., 'hasEmail': ..., 'hasPhone': ... }` — unverified account
  /// - `{ 'requiresOtp': true, 'challengeToken': ..., 'otpVia': 'sms'|'email' }` — 2FA login challenge
  /// - `{ 'role': ..., 'organisationId': ... }` — fully authenticated (tokens saved)
  Future<Map<String, dynamic>?> loginWithIdentifier(String identifier, String password) async {
    loading = true; error = null; notifyListeners();
    try {
      final data = await _api.loginWithIdentifier(identifier, password);

      // Unverified account — needs phone/email OTP to activate
      if (data['requiresVerification'] == true) {
        loading = false; notifyListeners();
        return Map<String, dynamic>.from(data as Map);
      }

      // 2FA login challenge — needs OTP from SMS or email
      if (data['requiresOtp'] == true) {
        loading = false; notifyListeners();
        return Map<String, dynamic>.from(data as Map);
      }

      await _applyAuthData(data);
      return {'role': data['user']['role'], 'organisationId': data['user']['organisationId']};
    } catch (e) {
      error = _friendly(e);
      loading = false; notifyListeners();
      return null;
    }
  }

  /// Returns:
  /// - `null`  on error (check `error` property)
  /// - `{ 'requiresVerification': true, ... }` — needs OTP verification
  Future<Map<String, dynamic>?> register(Map<String, dynamic> data) async {
    loading = true; error = null; notifyListeners();
    try {
      final res = await _api.register(data);
      loading = false; notifyListeners();
      // Registration now always requires verification first
      return Map<String, dynamic>.from(res as Map);
    } catch (e) {
      error = _friendly(e);
      loading = false; notifyListeners();
      return null;
    }
  }

  /// Called after OTP verification completes and full auth tokens are received.
  Future<void> applyVerifiedAuth(Map<String, dynamic> data) async {
    await _applyAuthData(data);
  }

  Future<void> _applyAuthData(Map<String, dynamic> data) async {
    await _storage.clear();
    await _storage.saveToken(data['access_token'] as String);
    if (data['refresh_token'] is String) {
      await _storage.saveRefreshToken(data['refresh_token'] as String);
    }
    await _storage.saveUser(data['user'] as Map<String, dynamic>);
    user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
    notifyListeners();
    _registerFcmToken();
  }

  // Register FCM push token with the API
  Future<void> _registerFcmToken() async {
    try {
      final token = await _getFcmToken();
      if (token != null && token.isNotEmpty) {
        await _api.registerFcmToken(token);
      }
      // Re-register whenever FCM rotates the token (keeps server in sync)
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
        try { await _api.registerFcmToken(newToken); } catch (_) {}
      });
    } catch (_) {
      // Never crash login because of FCM
    }
  }

  Future<String?> _getFcmToken() async {
    try {
      final messaging = FirebaseMessaging.instance;
      // Request permission (required on iOS, shown on Android 13+)
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final granted = settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!granted) return null;
      return await messaging.getToken();
    } catch (_) { return null; }
  }

  Future<void> logout(BuildContext context) async {
    // Remove FCM token on logout
    try {
      final token = await _storage.getToken();
      if (token != null) {
        final fcm = await _getFcmToken();
        if (fcm != null) await _api.removeFcmToken(fcm);
      }
    } catch (_) {}

    await _storage.clear();
    user = null;
    notifyListeners();
    if (context.mounted) {
      Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
    }
  }

  String _friendly(dynamic e) {
    final msg = e.toString();
    if (msg.contains('Invalid credentials') || msg.contains('Invalid phone'))
      return 'Wrong credentials — check phone, email or password';
    if (msg.contains('already registered'))
      return 'This phone number is already registered';
    if (msg.contains('deactivated'))
      return 'Account deactivated. Contact your admin.';
    if (msg.contains('SocketException') || msg.contains('connection'))
      return 'No connection to server. Is the API running?';
    return 'Something went wrong. Please try again.';
  }
}
