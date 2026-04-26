import 'package:flutter/material.dart';

class AppColors {
  // Brand
  static const primary      = Color(0xFF1B6B3A);
  static const primaryLight = Color(0xFF3DCE64);
  static const primaryPale  = Color(0xFFE8F5EE);
  static const dark         = Color(0xFF020A05);  // deep premium dark
  static const darkCard     = Color(0xFF0D1712);  // card surface in dark mode
  static const darkBorder   = Color(0xFF141F18);  // border in dark mode
  static const darkNav      = Color(0xFF080E09);  // nav bar in dark mode

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
    dividerColor: AppColors.border,
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

  static ThemeData dark() => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.dark,
      surface: AppColors.darkCard,
    ),
    fontFamily: 'DM Sans',
    scaffoldBackgroundColor: AppColors.dark,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.darkNav,
      foregroundColor: Colors.white,
      elevation: 0,
      shadowColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700, fontFamily: 'DM Sans'),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.darkBorder, width: 1),
      ),
      color: AppColors.darkCard,
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.darkNav,
      selectedItemColor: AppColors.primaryLight,
      unselectedItemColor: Color(0xFF3D5945),
      elevation: 0,
      type: BottomNavigationBarType.fixed,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF0A1410),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.darkBorder)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.darkBorder)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primaryLight, width: 1.5)),
      hintStyle: const TextStyle(color: Color(0xFF3D5945)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        shadowColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'DM Sans'),
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
    ),
    dividerColor: AppColors.darkBorder,
    textTheme: const TextTheme(
      bodyLarge:  TextStyle(color: Color(0xFFE6EDF3), fontSize: 15),
      bodyMedium: TextStyle(color: Color(0xFFB0C4B8), fontSize: 13),
      bodySmall:  TextStyle(color: Color(0xFF5A7A66), fontSize: 11),
    ),
  );

  // Convenience text styles
  static const TextStyle caption = TextStyle(fontSize: 11, color: AppColors.text4, fontWeight: FontWeight.w500);
  static const TextStyle h2     = TextStyle(fontSize: 16, color: AppColors.text1, fontWeight: FontWeight.w700);
  static const TextStyle body   = TextStyle(fontSize: 13, color: AppColors.text2, height: 1.6);
  static const TextStyle label   = TextStyle(fontSize: 11, color: AppColors.text3, fontWeight: FontWeight.w600, letterSpacing: 0.4);
  static const TextStyle heading = TextStyle(fontSize: 20, color: AppColors.text1, fontWeight: FontWeight.w800);
}

/// Theme-reactive color helpers. Use on any BuildContext inside a widget tree.
/// These automatically return the correct colour for light or dark mode.
extension AppThemeX on BuildContext {
  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  /// Card / container background (white ↔ dark card)
  Color get appCardColor    => isDarkMode ? AppColors.darkCard : Colors.white;
  /// Page scaffold background
  Color get appSurfaceColor => isDarkMode ? AppColors.dark : AppColors.surface;
  /// Bottom nav-bar / header background
  Color get appNavBarColor  => isDarkMode ? AppColors.darkNav : Colors.white;
  /// Borders and dividers
  Color get appBorderColor  => isDarkMode ? AppColors.darkBorder : AppColors.border;
  /// Primary text
  Color get appText1        => isDarkMode ? const Color(0xFFE6EDF3) : AppColors.text1;
  /// Secondary text
  Color get appText2        => isDarkMode ? const Color(0xFFB0C4B8) : AppColors.text2;
  /// Tertiary / muted text
  Color get appText3        => isDarkMode ? const Color(0xFF5A7A66) : AppColors.text3;
  /// Hint / placeholder text
  Color get appText4        => isDarkMode ? const Color(0xFF3D5945) : AppColors.text4;
  /// Selected nav-bar icon
  Color get appNavSelected  => isDarkMode ? AppColors.primaryLight : AppColors.primary;
}
