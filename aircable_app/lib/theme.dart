import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const primaryColor = Color(0xFF005CE6);
  static const ecoGreen = Color(0xFF2ECC71);
  static const bgColor = Color(0xFFF2FBF5);
  static const cardBg = Color(0xCCFFFFFF);
  static const textPrimary = Color(0xFF0A2D1D);
  static const textSecondary = Color(0xFF004B99);

  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        primary: primaryColor,
        secondary: ecoGreen,
        background: bgColor,
      ),
      textTheme: GoogleFonts.interTextTheme().copyWith(
        displayLarge: GoogleFonts.inter(fontWeight: FontWeight.w900, color: textPrimary),
        headlineMedium: GoogleFonts.inter(fontWeight: FontWeight.w800, color: textPrimary),
        titleMedium: GoogleFonts.inter(fontWeight: FontWeight.w600, color: textPrimary),
        bodyMedium: GoogleFonts.inter(color: textPrimary),
      ),
    );
  }
}
