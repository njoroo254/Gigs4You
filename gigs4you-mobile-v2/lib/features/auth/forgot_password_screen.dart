import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';

enum ResetStep { request, code, done }

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  ResetStep _step = ResetStep.request;
  final _idCtrl   = TextEditingController();
  final _otpCtrl  = TextEditingController();
  final _pw1Ctrl  = TextEditingController();
  final _pw2Ctrl  = TextEditingController();
  bool _busy      = false;
  bool _showPw    = false;

  @override
  void dispose() {
    _idCtrl.dispose(); _otpCtrl.dispose();
    _pw1Ctrl.dispose(); _pw2Ctrl.dispose();
    super.dispose();
  }

  Future<void> _requestReset() async {
    if (_idCtrl.text.trim().isEmpty) {
      _err('Enter your phone, email, or username'); return;
    }
    setState(() => _busy = true);
    try {
      final api = context.read<ApiClient>();
      await api.post('/auth/forgot-password', {'identifier': _idCtrl.text.trim()});
      if (mounted) setState(() => _step = ResetStep.code);
      _snack('Reset code sent to your phone / email', isError: false);
    } catch (e) {
      _err(e.toString().contains('404') ? 'Account not found' : 'Failed to send code');
    } finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _doReset() async {
    if (_otpCtrl.text.trim().length < 6) { _err('Enter the 6-digit code'); return; }
    if (_pw1Ctrl.text.length < 6)  { _err('Password must be at least 6 characters'); return; }
    if (_pw1Ctrl.text != _pw2Ctrl.text) { _err('Passwords do not match'); return; }
    setState(() => _busy = true);
    try {
      final api = context.read<ApiClient>();
      await api.post('/auth/reset-password', {
        'otp': _otpCtrl.text.trim(), 'newPassword': _pw1Ctrl.text,
      });
      if (mounted) setState(() => _step = ResetStep.done);
    } catch (e) {
      _err('Invalid or expired code. Request a new one.');
    } finally { if (mounted) setState(() => _busy = false); }
  }

  void _err(String msg) => _snack(msg, isError: true);
  void _snack(String msg, {bool isError = true}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.danger : AppColors.primary));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.surface,
    appBar: AppBar(
      backgroundColor: Colors.transparent, elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: AppColors.text1),
        onPressed: () => Navigator.pop(context))),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SizedBox(height: 8),
          // Header
          Container(
            width: 52, height: 52,
            decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(14)),
            child: const Center(child: Text('📍', style: TextStyle(fontSize: 26)))),
          const SizedBox(height: 20),

          if (_step == ResetStep.request) ...[
            const Text('Forgot password?',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.text1)),
            const SizedBox(height: 8),
            const Text("Enter your phone number, email, or username and we'll send a reset code.",
              style: TextStyle(fontSize: 14, color: AppColors.text3, height: 1.5)),
            const SizedBox(height: 28),
            _label('Phone / Email / Username'),
            _inp(_idCtrl, hint: '0712 345 678', keyboardType: TextInputType.phone),
            const SizedBox(height: 20),
            _btn('Send reset code', _busy ? null : _requestReset),
          ],

          if (_step == ResetStep.code) ...[
            const Text('Enter reset code',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.text1)),
            const SizedBox(height: 8),
            const Text('Enter the 6-digit code sent to your phone or email. Valid for 15 minutes.',
              style: TextStyle(fontSize: 14, color: AppColors.text3, height: 1.5)),
            const SizedBox(height: 28),
            _label('Reset code'),
            TextField(
              controller: _otpCtrl,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 8),
              decoration: InputDecoration(
                counterText: '',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                hintText: '------',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14)),
            ),
            const SizedBox(height: 16),
            _label('New password'),
            _inp(_pw1Ctrl, hint: 'Min. 6 characters', obscure: !_showPw,
              suffix: IconButton(
                icon: Icon(_showPw ? Icons.visibility_off : Icons.visibility, size: 18),
                onPressed: () => setState(() => _showPw = !_showPw))),
            const SizedBox(height: 12),
            _label('Confirm new password'),
            _inp(_pw2Ctrl, hint: 'Repeat password', obscure: !_showPw),
            const SizedBox(height: 20),
            _btn('Reset password', _busy ? null : _doReset),
            const SizedBox(height: 12),
            Center(child: TextButton(
              onPressed: () => setState(() => _step = ResetStep.request),
              child: const Text("Didn't get the code? Try again",
                style: TextStyle(fontSize: 13, color: AppColors.text3)))),
          ],

          if (_step == ResetStep.done) ...[
            const SizedBox(height: 32),
            const Center(child: Icon(Icons.check_circle_rounded,
              size: 72, color: AppColors.primary)),
            const SizedBox(height: 20),
            const Center(child: Text('Password reset!',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800))),
            const SizedBox(height: 10),
            const Center(child: Text('You can now log in with your new password.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: AppColors.text3, height: 1.5))),
            const SizedBox(height: 32),
            _btn('Go to login', () => Navigator.pop(context)),
          ],
        ]),
      ),
    ),
  );

  Widget _label(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(t, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.text3)));

  Widget _inp(TextEditingController ctrl, {
    String hint = '', TextInputType? keyboardType, bool obscure = false, Widget? suffix,
  }) => TextField(
    controller: ctrl, keyboardType: keyboardType, obscureText: obscure,
    style: const TextStyle(fontSize: 14),
    decoration: InputDecoration(
      hintText: hint, isDense: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      suffixIcon: suffix));

  Widget _btn(String label, VoidCallback? onTap) => SizedBox(
    width: double.infinity,
    child: ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      child: _busy
        ? const SizedBox(height: 18, width: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
        : Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))));
}
