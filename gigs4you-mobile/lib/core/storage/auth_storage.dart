import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class AuthStorage {
  static const _tokenKey   = 'auth_token';
  static const _userKey    = 'auth_user';
  static const _agentIdKey = 'agent_id';

  Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

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
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    await prefs.remove(_agentIdKey);
  }
}
