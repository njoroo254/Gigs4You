import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Per-user theme preference.
/// Key: `theme_<userId>` → bool (true = dark).
/// Each user's preference is stored independently so switching accounts
/// restores the theme that user last chose.
class ThemeProvider extends ChangeNotifier {
  ThemeMode _mode = ThemeMode.light;
  String? _userId;

  ThemeMode get mode  => _mode;
  bool get isDark     => _mode == ThemeMode.dark;

  /// Call this whenever the logged-in user changes (app start + login).
  Future<void> loadForUser(String? userId) async {
    _userId = (userId?.isNotEmpty == true) ? userId : null;
    if (_userId == null) {
      _mode = ThemeMode.light;
      notifyListeners();
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final dark  = prefs.getBool('theme_$_userId') ?? false;
    _mode = dark ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
  }

  Future<void> toggle() async {
    _mode = isDark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    if (_userId != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('theme_$_userId', isDark);
    }
  }
}
