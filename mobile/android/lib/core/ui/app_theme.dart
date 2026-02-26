import 'package:flutter/material.dart';

class AppPalette {
  static const Color primary = Color(0xFF042A47); // Requested primary
  static const Color primaryDeep = Color(0xFF021C30);
  static const Color accent = Color(0xFF0D4A79);
  static const Color accentStrong = Color(0xFF06375C);
  static const Color ink = Color(0xFF08263E);
  static const Color inkSoft = Color(0xFF3A5A73);
  static const Color sand = Color(0xFFEAF2F8);
  static const Color stone = Color(0xFFF4F8FC);
  static const Color card = Color(0xFFFFFFFF);
  static const Color muted = Color(0xFF6E879B);
  static const Color page = Color(0xFFE6EEF5);
  static const Color outline = Color(0xFFC7D6E2);
  static const Color outlineSoft = Color(0xFFDCE7F0);
  static const Color navIndicator = Color(0xFFD5E4F0);
}

ThemeData buildAppTheme() {
  const colorScheme = ColorScheme.light(
    primary: AppPalette.primary,
    onPrimary: Colors.white,
    secondary: AppPalette.accent,
    onSecondary: Colors.white,
    error: Color(0xFFB3261E),
    onError: Colors.white,
    surface: AppPalette.card,
    onSurface: AppPalette.ink,
    surfaceContainerHighest: AppPalette.stone,
    onSurfaceVariant: AppPalette.inkSoft,
    outline: AppPalette.outline,
    outlineVariant: AppPalette.outlineSoft,
    shadow: Color(0x33042A47),
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
      backgroundColor: Color(0xEEF2F8FC),
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
        side: BorderSide(color: AppPalette.outlineSoft),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppPalette.primaryDeep,
      contentTextStyle: TextStyle(color: Colors.white),
    ),
    dividerTheme: const DividerThemeData(
      color: AppPalette.outlineSoft,
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
        borderSide: const BorderSide(color: AppPalette.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppPalette.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppPalette.primary, width: 1.3),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFB3261E), width: 1.1),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: AppPalette.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppPalette.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppPalette.ink,
        side: const BorderSide(color: AppPalette.outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppPalette.primary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: AppPalette.navIndicator,
      secondarySelectedColor: AppPalette.navIndicator,
      side: const BorderSide(color: AppPalette.outline),
      labelStyle: textTheme.labelLarge?.copyWith(color: AppPalette.inkSoft),
      secondaryLabelStyle:
          textTheme.labelLarge?.copyWith(color: AppPalette.primary),
      checkmarkColor: AppPalette.primary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        visualDensity: VisualDensity.compact,
        side: const WidgetStatePropertyAll(
          BorderSide(color: AppPalette.outline),
        ),
        foregroundColor: const WidgetStatePropertyAll(AppPalette.inkSoft),
        backgroundColor: const WidgetStatePropertyAll(Colors.white),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppPalette.card,
      indicatorColor: AppPalette.navIndicator,
      shadowColor: Colors.black.withValues(alpha: 0.06),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          color: selected ? AppPalette.primary : AppPalette.inkSoft,
          fontSize: 12,
        );
      }),
    ),
    tabBarTheme: const TabBarThemeData(
      indicatorSize: TabBarIndicatorSize.tab,
      labelColor: AppPalette.primary,
      unselectedLabelColor: AppPalette.inkSoft,
      indicator: BoxDecoration(
        color: AppPalette.navIndicator,
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
    Color(0xFFF7FAFD),
    Color(0xFFEDF4FA),
    Color(0xFFE2ECF5),
  ],
);
