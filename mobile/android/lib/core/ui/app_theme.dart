import 'package:flutter/material.dart';

class AppPalette {
  static const Color ink = Color(0xFF0F2639);
  static const Color inkSoft = Color(0xFF31485A);
  static const Color accent = Color(0xFF1C3C5A);
  static const Color accentStrong = Color(0xFF0C2E46);
  static const Color sand = Color(0xFFE8E3DC);
  static const Color stone = Color(0xFFF4F3F1);
  static const Color card = Color(0xFFFFFFFF);
  static const Color muted = Color(0xFF7B8B99);
  static const Color page = Color(0xFFEFEEEC);
}

ThemeData buildAppTheme() {
  const colorScheme = ColorScheme.light(
    primary: AppPalette.accent,
    onPrimary: Colors.white,
    secondary: AppPalette.accentStrong,
    onSecondary: Colors.white,
    error: Color(0xFFB3261E),
    onError: Colors.white,
    surface: AppPalette.card,
    onSurface: AppPalette.ink,
    surfaceContainerHighest: AppPalette.stone,
    onSurfaceVariant: AppPalette.inkSoft,
    outline: Color(0xFFD6D0C8),
    outlineVariant: Color(0xFFE3DDD5),
    shadow: Color(0x330F2639),
  );

  final textTheme = Typography.material2021().black.apply(
        bodyColor: AppPalette.ink,
        displayColor: AppPalette.ink,
        fontFamily: 'Plus Jakarta Sans',
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppPalette.page,
    textTheme: textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: Color(0xE6EFEDEC),
      foregroundColor: AppPalette.ink,
      elevation: 0,
      centerTitle: false,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: AppPalette.ink,
        fontFamily: 'Plus Jakarta Sans',
      ),
    ),
    cardTheme: const CardThemeData(
      color: AppPalette.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(18)),
        side: BorderSide(color: Color(0x1A0F2639)),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppPalette.ink,
      contentTextStyle: TextStyle(color: Colors.white),
    ),
    dividerTheme: const DividerThemeData(
      color: Color(0x1A0F2639),
      thickness: 1,
      space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppPalette.stone,
      hintStyle: textTheme.bodyMedium?.copyWith(color: AppPalette.muted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0x220F2639)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0x220F2639)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppPalette.accent, width: 1.2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFB3261E), width: 1.1),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: AppPalette.accent,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppPalette.ink,
        side: const BorderSide(color: Color(0x331C3C5A)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppPalette.accent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppPalette.card,
      indicatorColor: const Color(0xFFDCE8F1),
      shadowColor: Colors.black.withValues(alpha: 0.08),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          color: selected ? AppPalette.ink : AppPalette.inkSoft,
          fontSize: 12,
        );
      }),
    ),
    tabBarTheme: const TabBarThemeData(
      indicatorSize: TabBarIndicatorSize.tab,
      labelColor: AppPalette.ink,
      unselectedLabelColor: AppPalette.inkSoft,
      indicator: BoxDecoration(
        color: Color(0xFFDCE8F1),
        borderRadius: BorderRadius.all(Radius.circular(999)),
      ),
      dividerColor: Colors.transparent,
      labelStyle: TextStyle(fontWeight: FontWeight.w600),
    ),
  );
}

const LinearGradient appPageGradient = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: <Color>[
    Color(0xFFF9F8F6),
    Color(0xFFEFEDEC),
    Color(0xFFE8E4DF),
  ],
);
