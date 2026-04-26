import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/storage/auth_storage.dart';

class ProfileProvider extends ChangeNotifier {
  final ApiClient _api;
  final _storage = AuthStorage();

  Agent? agent;
  Map<String, dynamic> wallet = {'balance': 0.0, 'pendingBalance': 0.0, 'currency': 'KES'};
  bool loading = false;
  bool checkedIn = false;
  String? error;

  ProfileProvider(this._api);

  Future<void> loadProfile() async {
    // ── Reset to null FIRST — prevents stale data from old session ──
    agent = null;
    error = null;
    loading = true;
    notifyListeners();

    try {
      final data = await _api.getMyProfile();
      if (data != null) {
        agent = Agent.fromJson(data);
        checkedIn = agent!.isCheckedIn;
        // Cache the agent ID for quick lookup
        await _storage.saveAgentId(agent!.id);
      }
      // Load wallet in parallel
      _loadWallet();
    } catch (e) {
      error = e.toString();
    }

    loading = false;
    notifyListeners();
  }

  Future<void> _loadWallet() async {
    try {
      wallet = await _api.getWallet();
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> checkIn(double lat, double lng) async {
    try {
      final data = await _api.checkIn(lat, lng);
      agent = Agent.fromJson(data);
      checkedIn = true;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> checkOut() async {
    try {
      final data = await _api.checkOut();
      agent = Agent.fromJson(data);
      checkedIn = false;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  double get walletBalance => double.tryParse(wallet['balance']?.toString() ?? '0') ?? 0;
  double get pendingBalance => double.tryParse(wallet['pendingBalance']?.toString() ?? '0') ?? 0;

  String get walletDisplay => 'KES ${walletBalance.toStringAsFixed(0)}';
}
