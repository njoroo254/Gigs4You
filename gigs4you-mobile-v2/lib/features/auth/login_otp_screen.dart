import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import 'auth_provider.dart';
import '../../main.dart';

/// Shown after a successful login for accounts that require 2FA.
/// The user enters the OTP sent via SMS or email.
class LoginOtpScreen extends StatefulWidget {
  final String challengeToken;
  final String otpVia; // 'sms' | 'email'

  const LoginOtpScreen({
    super.key,
    required this.challengeToken,
    required this.otpVia,
  });

  @override
  State<LoginOtpScreen> createState() => _LoginOtpScreenState();
}

class _LoginOtpScreenState extends State<LoginOtpScreen> {
  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  // Resend countdown
  int _resendSeconds = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startResendTimer();
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _resendSeconds = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() {
        if (_resendSeconds > 0) {
          _resendSeconds--;
        } else {
          t.cancel();
        }
      });
    });
  }

  Future<void> _submit() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    setState(() { _submitting = true; _error = null; });

    try {
      final api  = context.read<ApiClient>();
      final data = await api.verifyLoginOtp(widget.challengeToken, code);

      // Save tokens and user
      await context.read<AuthProvider>().applyVerifiedAuth(data);

      if (!mounted) return;
      final role  = data['user']['role'] as String? ?? 'worker';
      final orgId = data['user']['organisationId'] as String?;
      Navigator.pushNamedAndRemoveUntil(
        context, Gigs4YouApp.routeForRole(role, orgId), (_) => false);
    } catch (e) {
      final msg = e.toString();
      setState(() {
        _error = msg.contains('Invalid') || msg.contains('expired')
            ? 'Invalid or expired code. Try again.'
            : 'Verification failed. Please try again.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final via = widget.otpVia == 'sms' ? 'SMS' : 'email';

    return Scaffold(
      backgroundColor: AppColors.dark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 8, 28, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon
              Container(
                width: 52, height: 52,
                decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.lock_outline, color: Colors.white, size: 26)),
              const SizedBox(height: 28),

              const Text('Verify your identity',
                  style: TextStyle(
                      color: Colors.white, fontSize: 26,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(
                'We sent a 6-digit code to your $via. Enter it below.',
                style: TextStyle(color: Colors.white.withValues(alpha:0.55), fontSize: 14),
              ),
              const SizedBox(height: 36),

              // Code field
              TextField(
                controller:    _codeCtrl,
                keyboardType:  TextInputType.number,
                textAlign:     TextAlign.center,
                maxLength:     6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(
                    color: Colors.white, fontSize: 28,
                    fontWeight: FontWeight.w700, letterSpacing: 10),
                decoration: InputDecoration(
                  counterText:   '',
                  hintText:      '------',
                  hintStyle:     TextStyle(
                      color: Colors.white.withValues(alpha:0.2),
                      fontSize: 28, letterSpacing: 10),
                  filled:        true,
                  fillColor:     Colors.white.withValues(alpha:0.06),
                  border:        OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: AppColors.primary, width: 2)),
                  contentPadding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
                ),
                onChanged: (v) { if (v.length == 6) _submit(); },
              ),
              const SizedBox(height: 16),

              // Error
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha:0.12),
                      borderRadius: BorderRadius.circular(8)),
                  child: Text(_error!,
                      style: const TextStyle(color: Colors.redAccent, fontSize: 13))),

              const Spacer(),

              // Submit button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      textStyle: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w600)),
                  child: _submitting
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Verify'),
                ),
              ),
              const SizedBox(height: 16),

              // Resend
              Center(
                child: _resendSeconds > 0
                    ? Text('Resend code in ${_resendSeconds}s',
                        style: TextStyle(
                            color: Colors.white.withValues(alpha:0.4), fontSize: 13))
                    : GestureDetector(
                        onTap: () {
                          // Resend is not available for 2FA (security) — tell user to log in again
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Please sign in again to receive a new code.'),
                              backgroundColor: Colors.black87,
                            ),
                          );
                        },
                        child: Text('Didn\'t receive a code? Sign in again',
                            style: TextStyle(
                                color: AppColors.primaryLight,
                                fontSize: 13,
                                fontWeight: FontWeight.w600))),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
