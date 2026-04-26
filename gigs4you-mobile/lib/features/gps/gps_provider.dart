import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';

class GpsProvider extends ChangeNotifier {
  final ApiClient _api;

  Position? currentPosition;
  bool isTracking = false;
  StreamSubscription<Position>? _sub;
  Timer? _pingTimer;
  Timer? _retryTimer;

  GpsProvider(this._api);

  // Use lower accuracy on emulators to avoid NmeaClient crash
  static const _settingsHigh = LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: 15,
  );
  static const _settingsMedium = LocationSettings(
    accuracy: LocationAccuracy.medium,
    distanceFilter: 30,
  );

  Future<bool> requestPermission() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return false;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      return perm != LocationPermission.denied &&
             perm != LocationPermission.deniedForever;
    } catch (_) { return false; }
  }

  Future<Position?> getCurrentPosition() async {
    if (!await requestPermission()) return null;
    try {
      currentPosition = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      ).timeout(const Duration(seconds: 10));
      notifyListeners();
      return currentPosition;
    } catch (_) {
      // Return last known position as fallback
      try {
        currentPosition = await Geolocator.getLastKnownPosition();
        notifyListeners();
        return currentPosition;
      } catch (_) { return null; }
    }
  }

  void startTracking() async {
    if (isTracking) return;
    if (!await requestPermission()) return;
    isTracking = true;
    notifyListeners();
    _startStream();
  }

  void _startStream() {
    _sub?.cancel();
    try {
      // Use medium accuracy to avoid NmeaClient crash on emulator
      _sub = Geolocator.getPositionStream(
        locationSettings: _settingsMedium,
      ).listen(
        (pos) {
          currentPosition = pos;
          notifyListeners();
        },
        onError: (e) {
          // DeadSystemException / emulator crash — stop gracefully, don't rethrow
          debugPrint('GPS stream error (emulator?): $e');
          _sub?.cancel();
          isTracking = false;
          notifyListeners();
          // Retry after 10 seconds
          _retryTimer?.cancel();
          _retryTimer = Timer(const Duration(seconds: 10), () {
            if (!isTracking) _startStream();
          });
        },
        cancelOnError: false,
      );
    } catch (e) {
      debugPrint('GPS stream start failed: $e');
      isTracking = false;
      notifyListeners();
    }

    // Ping API every 30 seconds with current position
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (currentPosition != null && isTracking) {
        _api.pingLocation(
          currentPosition!.latitude,
          currentPosition!.longitude,
          speed: currentPosition!.speed * 3.6,
          accuracy: currentPosition!.accuracy,
        );
      }
    });
  }

  void stopTracking() {
    _sub?.cancel();
    _pingTimer?.cancel();
    _retryTimer?.cancel();
    isTracking = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _pingTimer?.cancel();
    _retryTimer?.cancel();
    super.dispose();
  }
}
