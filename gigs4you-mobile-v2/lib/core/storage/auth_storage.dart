import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class AuthStorage {
  static const _tokenKey   = 'auth_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userKey    = 'auth_user';
  static const _agentIdKey = 'agent_id';

  // Auth token stored in encrypted Keychain/Keystore
  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> saveToken(String token) async {
    await _secure.write(key: _tokenKey, value: token);
  }

  Future<String?> getToken() async {
    return _secure.read(key: _tokenKey);
  }

  Future<void> saveRefreshToken(String token) async {
    await _secure.write(key: _refreshTokenKey, value: token);
  }

  Future<String?> getRefreshToken() async {
    return _secure.read(key: _refreshTokenKey);
  }

  // Non-sensitive user metadata stays in SharedPreferences
  Future<void> saveUser(Map<String, dynamic> user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userKey, jsonEncode(user));
  }

  Future<Map<String, dynamic>?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_userKey);
    if (str == null) return null;
    return jsonDecode(str) as Map<String, dynamic>;
  }

  Future<void> saveAgentId(String agentId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_agentIdKey, agentId);
  }

  Future<String?> getAgentId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_agentIdKey);
  }

  // Get the current user's ID from stored user object
  Future<String?> getUserId() async {
    final user = await getUser();
    return user?['id'] as String?;
  }

  // Get the current user's role
  Future<String?> getRole() async {
    final user = await getUser();
    return user?['role'] as String?;
  }

  // Get the current user's orgId
  Future<String?> getOrgId() async {
    final user = await getUser();
    return user?['organisationId'] as String?;
  }

  Future<void> clear() async {
    await _secure.delete(key: _tokenKey);
    await _secure.delete(key: _refreshTokenKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userKey);
    await prefs.remove(_agentIdKey);
  }
}
