import 'package:flutter/material.dart';

class AppColors {
  // Brand
  static const primary      = Color(0xFF1B6B3A);
  static const primaryLight = Color(0xFF4CAF7D);
  static const primaryPale  = Color(0xFFE8F5EE);
  static const dark         = Color(0xFF0D1B14);

  // Semantic
  static const info         = Color(0xFF3B82F6);
  static const infoPale     = Color(0xFFEFF6FF);
  static const danger       = Color(0xFFEF4444);
  static const dangerPale   = Color(0xFFFEF2F2);
  static const warning      = Color(0xFFF59E0B);
  static const warningPale  = Color(0xFFFEF3C7);
  static const success      = Color(0xFF10B981);

  // Aliases used in jobs_tab and dashboard_tab
  static const accent       = Color(0xFFF59E0B);   // same as warning
  static const dangerLight  = Color(0xFFFEE2E2);   // light red background

  // Skill category colours
  static const skillBlue    = Color(0xFF3B82F6);
  static const skillOrange  = Color(0xFFF97316);
  static const skillTeal    = Color(0xFF0D9488);
  static const skillPurple  = Color(0xFF8B5CF6);
  static const skillPink    = Color(0xFFEC4899);

  // Neutrals
  static const surface      = Color(0xFFF7F8FA);
  static const white        = Color(0xFFFFFFFF);
  static const border       = Color(0xFFE5E7EB);
  static const text1        = Color(0xFF111827);
  static const text2        = Color(0xFF374151);
  static const text3        = Color(0xFF6B7280);
  static const text4        = Color(0xFF9CA3AF);
}

class AppTheme {
  static ThemeData light() => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
    fontFamily: 'DM Sans',
    scaffoldBackgroundColor: AppColors.surface,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.text1,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: AppColors.text1, fontSize: 17, fontWeight: FontWeight.w700, fontFamily: 'DM Sans'),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border, width: 0.5),
      ),
      color: AppColors.white,
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.white,
      selectedItemColor: AppColors.primary,
      unselectedItemColor: AppColors.text4,
      elevation: 0,
      type: BottomNavigationBarType.fixed,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'DM Sans'),
      ),
    ),
    textTheme: const TextTheme(
      bodyLarge:  TextStyle(color: AppColors.text1, fontSize: 15),
      bodyMedium: TextStyle(color: AppColors.text2, fontSize: 13),
      bodySmall:  TextStyle(color: AppColors.text3, fontSize: 11),
    ),
  );

  // Convenience text styles
  static const TextStyle caption = TextStyle(fontSize: 11, color: AppColors.text4, fontWeight: FontWeight.w500);
  static const TextStyle h2     = TextStyle(fontSize: 16, color: AppColors.text1, fontWeight: FontWeight.w700);
  static const TextStyle body   = TextStyle(fontSize: 13, color: AppColors.text2, height: 1.6);
  static const TextStyle label   = TextStyle(fontSize: 11, color: AppColors.text3, fontWeight: FontWeight.w600, letterSpacing: 0.4);
  static const TextStyle heading = TextStyle(fontSize: 20, color: AppColors.text1, fontWeight: FontWeight.w800);
}
