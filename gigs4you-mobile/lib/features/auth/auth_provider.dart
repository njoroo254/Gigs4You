import 'package:flutter/material.dart';
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

  Future<String?> login(String phone, String password) async {
    return loginWithIdentifier(phone, password);
  }

  Future<String?> loginWithIdentifier(String identifier, String password) async {
    loading = true; error = null; notifyListeners();
    try {
      final data = await _api.loginWithIdentifier(identifier, password);
      await _storage.clear();
      await _storage.saveToken(data['access_token']);
      await _storage.saveUser(data['user']);
      user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
      loading = false; notifyListeners();

      // Register FCM token in background
      _registerFcmToken();

      return data['user']['role'] as String?;
    } catch (e) {
      error = _friendly(e);
      loading = false; notifyListeners();
      return null;
    }
  }

  Future<String?> register(Map<String, dynamic> data) async {
    loading = true; error = null; notifyListeners();
    try {
      final res = await _api.register(data);
      await _storage.clear();
      await _storage.saveToken(res['access_token']);
      await _storage.saveUser(res['user']);
      user = AppUser.fromJson(res['user'] as Map<String, dynamic>);
      loading = false; notifyListeners();

      _registerFcmToken();

      return res['user']['role'] as String?;
    } catch (e) {
      error = _friendly(e);
      loading = false; notifyListeners();
      return null;
    }
  }

  // Register FCM push token with the API
  Future<void> _registerFcmToken() async {
    try {
      // Dynamic import to avoid crash if firebase_messaging not configured
      final messaging = await _getFcmToken();
      if (messaging != null && messaging.isNotEmpty) {
        await _api.registerFcmToken(messaging);
      }
    } catch (_) {
      // Never crash login because of FCM
    }
  }

  Future<String?> _getFcmToken() async {
    try {
      // Uses firebase_messaging if available
      // ignore: avoid_dynamic_calls
      final FirebaseMessaging = await _dynamicImport('firebase_messaging');
      if (FirebaseMessaging == null) return null;
      return null; // Will be replaced with real FCM call once Firebase configured
    } catch (_) { return null; }
  }

  // ignore: non_constant_identifier_names
  Future<dynamic> _dynamicImport(String pkg) async {
    // Flutter doesn't support dynamic imports — placeholder
    // Firebase setup requires google-services.json + FirebaseApp.initializeApp()
    return null;
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
