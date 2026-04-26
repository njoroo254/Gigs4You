import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import 'auth_provider.dart';

/// Shown after registration (or stalled login) to verify phone and/or email.
///
/// [verificationToken] — the short-lived JWT from the backend.
/// [hasPhone] / [hasEmail] — which contacts need verification.
/// [onVerified] — called with the full auth data once all contacts are verified.
class VerificationScreen extends StatefulWidget {
  final String verificationToken;
  final bool hasPhone;
  final bool hasEmail;
  final void Function(Map<String, dynamic> authData) onVerified;

  const VerificationScreen({
    super.key,
    required this.verificationToken,
    required this.hasPhone,
    required this.hasEmail,
    required this.onVerified,
  });

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  // Which contact we are currently verifying ('phone' first, then 'email')
  late String _currentType;
  late String _verificationToken;

  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  // Resend countdown
  int _resendSeconds = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _verificationToken = widget.verificationToken;
    // Always verify phone first; email after (if provided)
    _currentType = widget.hasPhone ? 'phone' : 'email';
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
        if (_resendSeconds > 0) _resendSeconds--;
        else t.cancel();
      });
    });
  }

  Future<void> _submit() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the full 6-digit code');
      return;
    }

    setState(() { _submitting = true; _error = null; });

    try {
      final api = context.read<ApiClient>();
      final result = await api.verifyContact(_verificationToken, _currentType, code);

      if (!mounted) return;

      if (result['requiresMoreVerification'] == true) {
        // Phone verified — now verify email
        final remaining = (result['remaining'] as List?)?.cast<String>() ?? [];
        setState(() {
          _currentType = remaining.first;
          _verificationToken = result['verificationToken'] as String? ?? _verificationToken;
          _codeCtrl.clear();
          _error = null;
          _submitting = false;
        });
        _startResendTimer();
        return;
      }

      // Fully verified — auth tokens returned
      final auth = context.read<AuthProvider>();
      await auth.applyVerifiedAuth(result);
      if (mounted) widget.onVerified(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _friendly(e);
        _submitting = false;
      });
    }
  }

  Future<void> _resend() async {
    if (_resendSeconds > 0) return;
    try {
      await context.read<ApiClient>().resendVerification(_verificationToken, _currentType);
      if (mounted) {
        _startResendTimer();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('New code sent to your $_currentType'),
          backgroundColor: AppColors.primary,
        ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not resend code. Please try again.'),
          backgroundColor: Colors.red,
        ));
      }
    }
  }

  String _friendly(dynamic e) {
    final msg = e.toString();
    if (msg.contains('Invalid or expired')) return 'Incorrect code — please check and try again.';
    if (msg.contains('expired') || msg.contains('session')) return 'Session expired. Please go back and try again.';
    if (msg.contains('SocketException') || msg.contains('connection')) return 'No connection. Check your internet.';
    return 'Something went wrong. Please try again.';
  }

  @override
  Widget build(BuildContext context) {
    final isPhone = _currentType == 'phone';
    final bothNeeded = widget.hasPhone && widget.hasEmail;

    return Scaffold(
      backgroundColor: AppColors.dark,
      appBar: AppBar(
        backgroundColor: AppColors.dark,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Verify your account',
          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 32, 28, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Progress indicator when verifying both
              if (bothNeeded) ...[
                Row(children: [
                  _StepDot(
                    label: 'Phone',
                    done: _currentType == 'email',
                    active: _currentType == 'phone',
                  ),
                  Expanded(child: Container(height: 2,
                    color: _currentType == 'email'
                      ? AppColors.primary
                      : Colors.white.withValues(alpha: 0.15))),
                  _StepDot(
                    label: 'Email',
                    done: false,
                    active: _currentType == 'email',
                  ),
                ]),
                const SizedBox(height: 32),
              ],

              // Icon
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isPhone ? Icons.phone_android_rounded : Icons.email_outlined,
                  color: AppColors.primaryLight,
                  size: 30,
                ),
              ),
              const SizedBox(height: 20),

              Text(
                isPhone ? 'Verify your phone' : 'Verify your email',
                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                isPhone
                  ? 'We sent a 6-digit code to your phone via SMS. Enter it below to activate your account.'
                  : 'We sent a 6-digit code to your email address. Enter it below to continue.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 14, height: 1.5),
              ),
              const SizedBox(height: 36),

              // OTP input
              _OtpField(controller: _codeCtrl, onComplete: _submit),
              const SizedBox(height: 16),

              // Error message
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_error!,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
                ),
                const SizedBox(height: 16),
              ],

              // Verify button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _submitting
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(Colors.white)))
                    : const Text('Verify', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                ),
              ),
              const SizedBox(height: 20),

              // Resend
              Center(
                child: GestureDetector(
                  onTap: _resendSeconds == 0 ? _resend : null,
                  child: RichText(text: TextSpan(children: [
                    TextSpan(
                      text: "Didn't receive it? ",
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 13)),
                    TextSpan(
                      text: _resendSeconds > 0
                        ? 'Resend in ${_resendSeconds}s'
                        : 'Resend code',
                      style: TextStyle(
                        color: _resendSeconds > 0
                          ? Colors.white.withValues(alpha: 0.3)
                          : AppColors.primaryLight,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ])),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── 6-box OTP field ──────────────────────────────────────────────────────────
class _OtpField extends StatefulWidget {
  final TextEditingController controller;
  final VoidCallback onComplete;
  const _OtpField({required this.controller, required this.onComplete});

  @override
  State<_OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<_OtpField> {
  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: widget.controller,
      keyboardType: TextInputType.number,
      maxLength: 6,
      textAlign: TextAlign.center,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: 14,
      ),
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        counterText: '',
        hintText: '······',
        hintStyle: TextStyle(
          color: Colors.white.withValues(alpha: 0.2),
          fontSize: 28,
          letterSpacing: 14,
        ),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.07),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 18),
      ),
      onChanged: (v) {
        if (v.length == 6) widget.onComplete();
      },
    );
  }
}

// ── Step dot for progress indicator ─────────────────────────────────────────
class _StepDot extends StatelessWidget {
  final String label;
  final bool done;
  final bool active;
  const _StepDot({required this.label, required this.done, required this.active});

  @override
  Widget build(BuildContext context) => Column(children: [
    Container(
      width: 28, height: 28,
      decoration: BoxDecoration(
        color: done ? AppColors.primary : active
          ? AppColors.primaryLight.withValues(alpha: 0.2)
          : Colors.white.withValues(alpha: 0.1),
        shape: BoxShape.circle,
        border: Border.all(
          color: done || active ? AppColors.primary : Colors.white.withValues(alpha: 0.2),
          width: 1.5,
        ),
      ),
      child: done
        ? const Icon(Icons.check, size: 14, color: Colors.white)
        : null,
    ),
    const SizedBox(height: 4),
    Text(label,
      style: TextStyle(
        fontSize: 10,
        color: active || done ? Colors.white : Colors.white.withValues(alpha: 0.3),
        fontWeight: active ? FontWeight.w700 : FontWeight.normal,
      )),
  ]);
}
