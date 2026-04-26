import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import 'auth_provider.dart';
import '../../main.dart';
import 'verification_screen.dart';
import 'login_otp_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _identifierCtrl = TextEditingController(); // phone | email | username
  final _passCtrl       = TextEditingController();
  bool _showPass = false;

  @override
  void dispose() { _identifierCtrl.dispose(); _passCtrl.dispose(); super.dispose(); }

  Future<void> _login() async {
    final auth = context.read<AuthProvider>();
    final result = await auth.loginWithIdentifier(_identifierCtrl.text.trim(), _passCtrl.text);
    if (!mounted) return;
    if (result == null) return; // error shown via auth.error

    if (result['requiresVerification'] == true) {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => VerificationScreen(
          verificationToken: result['verificationToken'] as String,
          hasPhone: result['hasPhone'] as bool? ?? true,
          hasEmail: result['hasEmail'] as bool? ?? false,
          onVerified: (authData) {
            final role  = authData['user']['role'] as String? ?? 'worker';
            final orgId = authData['user']['organisationId'] as String?;
            Navigator.pushNamedAndRemoveUntil(
              context, Gigs4YouApp.routeForRole(role, orgId), (_) => false);
          },
        ),
      ));
      return;
    }

    if (result['requiresOtp'] == true) {
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => LoginOtpScreen(
          challengeToken: result['challengeToken'] as String,
          otpVia: result['otpVia'] as String? ?? 'email',
        ),
      ));
      return;
    }

    final role  = result['role'] as String? ?? 'worker';
    final orgId = result['organisationId'] as String?;
    if (context.mounted) {
      Navigator.pushReplacementNamed(context, Gigs4YouApp.routeForRole(role, orgId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.dark,
      body: Stack(children: [
        // Premium glow orbs
        Positioned(top: -80, left: -60, child: Container(
          width: 280, height: 280,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [
              AppColors.primary.withValues(alpha: 0.25),
              Colors.transparent,
            ]),
          ),
        )),
        Positioned(bottom: 80, right: -40, child: Container(
          width: 200, height: 200,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [
              const Color(0xFFF59E0B).withValues(alpha: 0.10),
              Colors.transparent,
            ]),
          ),
        )),
        SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 40, 28, 28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Logo with glow
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                  colors: [AppColors.primary, Color(0xFF25934F)],
                ),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.4), blurRadius: 20, spreadRadius: 2)],
              ),
              child: const Icon(Icons.location_on_rounded, color: Colors.white, size: 28)),
            const SizedBox(height: 28),

            const Text('Welcome back', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Sign in to Gigs4You', style: TextStyle(color: Colors.white.withValues(alpha:0.45), fontSize: 14)),
            const SizedBox(height: 36),

            // Identifier field
            _Label('Phone, email or username'),
            const SizedBox(height: 6),
            TextField(
              controller: _identifierCtrl,
              keyboardType: TextInputType.text,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: _inputDeco('0712345678 or you@email.com', Icons.person_outline),
            ),
            const SizedBox(height: 16),

            // Password field
            _Label('Password'),
            const SizedBox(height: 6),
            TextField(
              controller: _passCtrl,
              obscureText: !_showPass,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              onSubmitted: (_) => _login(),
              decoration: _inputDeco('Your password', Icons.lock_outline).copyWith(
                suffixIcon: IconButton(
                  icon: Icon(_showPass ? Icons.visibility_off : Icons.visibility,
                    color: Colors.white38, size: 18),
                  onPressed: () => setState(() => _showPass = !_showPass))),
            ),
            const SizedBox(height: 8),

            // Forgot password
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/forgot-password'),
                child: const Text('Forgot password?',
                  style: TextStyle(
                    color: AppColors.primaryLight,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  )),
              ),
            ),
            const SizedBox(height: 20),

            // Error
            if (auth.error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.red.withValues(alpha:0.12),
                  borderRadius: BorderRadius.circular(8)),
                child: Text(auth.error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13))),
              const SizedBox(height: 16),
            ],

            // Login button
            SizedBox(width: double.infinity,
              child: ElevatedButton(
                onPressed: auth.loading ? null : _login,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: auth.loading
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                  : const Text('Sign in', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              )),
            const SizedBox(height: 20),

            // Register links
            Center(child: Column(children: [
              GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/register'),
                child: RichText(text: TextSpan(children: [
                  TextSpan(text: "Don't have an account? ",
                    style: TextStyle(color: Colors.white.withValues(alpha:0.4), fontSize: 13)),
                  const TextSpan(text: 'Sign up', style: TextStyle(color: AppColors.primaryLight, fontWeight: FontWeight.w700, fontSize: 13)),
                ]))),
            ])),
          ]),
        ),
      ),
      ]),    // closes Stack children + Stack
    );
  }

  InputDecoration _inputDeco(String hint, IconData icon) => InputDecoration(
    hintText: hint, hintStyle: TextStyle(color: Colors.white.withValues(alpha:0.25), fontSize: 14),
    prefixIcon: Icon(icon, color: Colors.white38, size: 18),
    filled: true, fillColor: Colors.white.withValues(alpha:0.07),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: Colors.white.withValues(alpha:0.1))),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: Colors.white.withValues(alpha:0.1))),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
    contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
  );

  Widget _Label(String text) => Text(text,
    style: TextStyle(color: Colors.white.withValues(alpha:0.55), fontSize: 12, fontWeight: FontWeight.w600));
}
