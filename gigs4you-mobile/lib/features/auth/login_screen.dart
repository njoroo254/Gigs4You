import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import 'auth_provider.dart';
import '../../core/storage/auth_storage.dart';
import '../../main.dart';

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
    final role = await auth.loginWithIdentifier(_identifierCtrl.text.trim(), _passCtrl.text);
    if (!mounted) return;
    if (role == null) return; // error shown in UI

    // Route by role — get orgId from stored user to decide agent vs worker
    final storage = AuthStorage();
    final userData = await storage.getUser();
    final orgId = userData?['organisationId'];
    final route = Gigs4YouApp.routeForRole(role, orgId);
    if (context.mounted) Navigator.pushReplacementNamed(context, route);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.dark,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 40, 28, 28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Logo
            Container(width: 52, height: 52,
              decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.location_on_rounded, color: Colors.white, size: 28)),
            const SizedBox(height: 28),

            const Text('Welcome back', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Sign in to Gigs4You', style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 14)),
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
            const SizedBox(height: 28),

            // Error
            if (auth.error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.red.withOpacity(0.12),
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
                    style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 13)),
                  const TextSpan(text: 'Sign up', style: TextStyle(color: AppColors.primaryLight, fontWeight: FontWeight.w700, fontSize: 13)),
                ]))),
            ])),
          ]),
        ),
      ),
    );
  }

  InputDecoration _inputDeco(String hint, IconData icon) => InputDecoration(
    hintText: hint, hintStyle: TextStyle(color: Colors.white.withOpacity(0.25), fontSize: 14),
    prefixIcon: Icon(icon, color: Colors.white38, size: 18),
    filled: true, fillColor: Colors.white.withOpacity(0.07),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
    contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
  );

  Widget _Label(String text) => Text(text,
    style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 12, fontWeight: FontWeight.w600));
}
