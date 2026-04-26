import '../../main.dart';
import '../../core/storage/auth_storage.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import 'auth_provider.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  int    _step = 0;          // 0 = choose path, 1 = fill form
  String _path = 'worker';   // 'worker' | 'organisation'
  bool   _showPass = false;
  bool   _loading  = false;

  final _nameCtrl    = TextEditingController();
  final _phoneCtrl   = TextEditingController();
  final _emailCtrl   = TextEditingController();
  final _passCtrl    = TextEditingController();
  final _companyCtrl = TextEditingController();
  String _county     = '';

  final _counties = ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika',
                     'Machakos','Meru','Nyeri','Kisii','Other'];

  @override
  void dispose() {
    for (final c in [_nameCtrl,_phoneCtrl,_emailCtrl,_passCtrl,_companyCtrl]) c.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name  = _nameCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();
    final pass  = _passCtrl.text;
    final company = _companyCtrl.text.trim();

    if (name.isEmpty || phone.isEmpty || pass.isEmpty)
      return _err('Name, phone and password are required');
    if (_path == 'organisation' && company.isEmpty)
      return _err('Company name is required');
    if (pass.length < 6) return _err('Password must be at least 6 characters');

    setState(() => _loading = true);
    final auth = context.read<AuthProvider>();

    final payload = {
      'name':  name, 'phone': phone, 'password': pass,
      'email': _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
      'county': _county.isEmpty ? null : _county,
      // Organisation path → user becomes admin of their org
      'role':        _path == 'organisation' ? 'admin' : 'agent',
      'companyName': _path == 'organisation' ? company : null,
    };

    final error = await auth.register(payload);
    if (!mounted) return;
    setState(() => _loading = false);

    if (error != null) {
      _err(error);
    } else {
      // Route to correct home based on role
      final storage = AuthStorage();
      final userData = await storage.getUser();
      final role  = userData?['role'] ?? 'worker';
      final orgId = userData?['organisationId'];
      final route = Gigs4YouApp.routeForRole(role, orgId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_path == 'organisation'
            ? '🎉 Organisation account created! You\'re the admin.'
            : '🎉 Account created! Add your skills in Profile.'),
          backgroundColor: AppColors.primary,
          duration: const Duration(seconds: 2),
        ));
        Navigator.pushNamedAndRemoveUntil(context, route, (_) => false);
      }
    }
  }

  void _err(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.dark,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: _step == 0 ? _buildChoose() : _buildForm(),
        ),
      ),
    );
  }

  // ── Step 0: Choose path ─────────────────────────
  Widget _buildChoose() => Column(
    key: const ValueKey('choose'),
    children: [
      // Back to login
      Align(
        alignment: Alignment.topLeft,
        child: TextButton.icon(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.arrow_back, size: 16, color: Colors.white60),
          label: const Text('Back', style: TextStyle(color: Colors.white60, fontSize: 13)),
        ),
      ),
      const Spacer(),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: Column(children: [
          // Logo
          Container(width: 56, height: 56, decoration: BoxDecoration(
            color: AppColors.primary, borderRadius: BorderRadius.circular(16)),
            child: const Icon(Icons.location_on_rounded, color: Colors.white, size: 28)),
          const SizedBox(height: 20),
          const Text('Join Gigs4You',
            style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text('How will you be using the platform?',
            style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 14),
            textAlign: TextAlign.center),
          const SizedBox(height: 40),

          // Worker card
          _PathCard(
            icon: Icons.person_rounded,
            title: 'I\'m a worker / freelancer',
            subtitle: 'Find gigs, build a verified profile, get paid via M-Pesa',
            bullets: ['Browse & apply for jobs', 'Complete tasks assigned by employers',
                      'Track your XP, streaks & ratings', 'Get paid directly to M-Pesa'],
            color: AppColors.primary,
            isSelected: _path == 'worker',
            onTap: () => setState(() => _path = 'worker'),
          ),
          const SizedBox(height: 14),

          // Organisation card
          _PathCard(
            icon: Icons.business_rounded,
            title: 'I\'m registering an organisation',
            subtitle: 'Hire agents, assign tasks, track field teams, pay via M-Pesa',
            bullets: ['You become the organisation Admin', 'Invite managers, supervisors & agents',
                      'Post jobs & assign tasks', 'Bulk pay your team via M-Pesa Daraja'],
            color: const Color(0xFF3B82F6),
            isSelected: _path == 'organisation',
            onTap: () => setState(() => _path = 'organisation'),
          ),
          const SizedBox(height: 28),

          // Continue
          SizedBox(width: double.infinity, child: ElevatedButton(
            onPressed: () => setState(() => _step = 1),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(vertical: 16)),
            child: Text('Continue as ${_path == 'worker' ? 'Worker' : 'Organisation'}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          )),
        ]),
      ),
      const Spacer(),
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text('Already have an account? Sign in',
          style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 13)),
      ),
      const SizedBox(height: 8),
    ],
  );

  // ── Step 1: Fill form ───────────────────────────
  Widget _buildForm() => SingleChildScrollView(
    key: const ValueKey('form'),
    padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Back
      TextButton.icon(
        onPressed: () => setState(() => _step = 0),
        icon: const Icon(Icons.arrow_back, size: 16, color: Colors.white60),
        label: const Text('Back', style: TextStyle(color: Colors.white60, fontSize: 13)),
      ),
      const SizedBox(height: 4),

      // Header
      Text(
        _path == 'worker' ? 'Worker account' : 'Organisation account',
        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text(
        _path == 'organisation'
          ? 'You\'ll be the Admin. Add team members after signing in.'
          : 'Add your skills & rates after signing in to get hired.',
        style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 13, height: 1.5)),
      const SizedBox(height: 28),

      // Company name (org only)
      if (_path == 'organisation') ...[
        _Label('Company / organisation name *'),
        _Field(_companyCtrl, hint: 'e.g. Bidco Africa Ltd', icon: Icons.business),
        const SizedBox(height: 14),
      ],

      // Full name
      _Label(_path == 'organisation' ? 'Your name (Admin contact) *' : 'Full name *'),
      _Field(_nameCtrl, hint: 'Peter Mwangi', icon: Icons.person),
      const SizedBox(height: 14),

      // Phone
      _Label('Phone number *'),
      _Field(_phoneCtrl, hint: '0712 345 678', icon: Icons.phone, type: TextInputType.phone),
      const SizedBox(height: 14),

      // Email
      _Label('Email (optional)'),
      _Field(_emailCtrl, hint: 'you@email.com', icon: Icons.email, type: TextInputType.emailAddress),
      const SizedBox(height: 14),

      // County
      _Label('County'),
      Container(
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.07),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white.withOpacity(0.1))),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: _county.isEmpty ? null : _county,
            hint: const Padding(padding: EdgeInsets.symmetric(horizontal: 14),
              child: Text('Select county', style: TextStyle(color: Colors.white38, fontSize: 14))),
            dropdownColor: AppColors.dark,
            isExpanded: true,
            icon: const Icon(Icons.expand_more, color: Colors.white38),
            items: _counties.map((c) => DropdownMenuItem(
              value: c,
              child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text(c, style: const TextStyle(color: Colors.white, fontSize: 14))),
            )).toList(),
            onChanged: (v) => setState(() => _county = v ?? ''),
          ),
        ),
      ),
      const SizedBox(height: 14),

      // Password
      _Label('Password *'),
      TextField(
        controller: _passCtrl,
        obscureText: !_showPass,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(
          hintText: 'Min 6 characters',
          hintStyle: TextStyle(color: Colors.white.withOpacity(0.25)),
          prefixIcon: const Icon(Icons.lock, color: Colors.white38, size: 18),
          suffixIcon: IconButton(
            icon: Icon(_showPass ? Icons.visibility_off : Icons.visibility,
              color: Colors.white38, size: 18),
            onPressed: () => setState(() => _showPass = !_showPass)),
          filled: true, fillColor: Colors.white.withOpacity(0.07),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
          contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14)),
      ),
      const SizedBox(height: 24),

      // Info box
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.primary.withOpacity(0.2))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.info_outline, color: AppColors.primaryLight, size: 15),
            const SizedBox(width: 6),
            Text(_path == 'organisation' ? 'After signing in:' : 'Next steps:',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 8),
          ...(_path == 'organisation'
            ? ['Go to Organisations → create your org',
               'Invite agents/supervisors by phone number',
               'Invited members unlock the Tasks tab in their app']
            : ['Go to Profile tab → add your skills',
               'Set your daily rate and M-Pesa phone',
               'Apply for jobs — employers can also invite you',
               'Once invited to a team, Tasks tab unlocks']
          ).map((t) => Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('• ', style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
              Expanded(child: Text(t,
                style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 11, height: 1.4))),
            ]),
          )),
        ]),
      ),
      const SizedBox(height: 24),

      // Submit
      SizedBox(width: double.infinity, child: ElevatedButton(
        onPressed: _loading ? null : _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          padding: const EdgeInsets.symmetric(vertical: 16),
          disabledBackgroundColor: AppColors.primary.withOpacity(0.4)),
        child: _loading
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(
              strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
          : Text(
              _path == 'organisation' ? 'Create organisation account' : 'Create worker account',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      )),
    ]),
  );

  Widget _Label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: TextStyle(color: Colors.white.withOpacity(0.6),
      fontSize: 12, fontWeight: FontWeight.w600)));

  Widget _Field(TextEditingController ctrl,
      {String hint='', IconData? icon, TextInputType type=TextInputType.text}) =>
    TextField(
      controller: ctrl, keyboardType: type,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.white.withOpacity(0.25)),
        prefixIcon: icon != null ? Icon(icon, color: Colors.white38, size: 18) : null,
        filled: true, fillColor: Colors.white.withOpacity(0.07),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
        contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14)),
    );
}

// ── Path choice card ─────────────────────────────────
class _PathCard extends StatelessWidget {
  final IconData icon; final String title, subtitle; final List<String> bullets;
  final Color color; final bool isSelected; final VoidCallback onTap;
  const _PathCard({required this.icon, required this.title, required this.subtitle,
    required this.bullets, required this.color, required this.isSelected, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isSelected ? color.withOpacity(0.15) : Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isSelected ? color : Colors.white.withOpacity(0.1), width: isSelected ? 2 : 1)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 38, height: 38, decoration: BoxDecoration(
            color: color.withOpacity(0.2), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: color, size: 20)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 2),
            Text(subtitle, style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 11, height: 1.4)),
          ])),
          if (isSelected) Icon(Icons.check_circle_rounded, color: color, size: 22),
        ]),
        const SizedBox(height: 12),
        ...bullets.map((b) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(children: [
            Icon(Icons.arrow_right_rounded, size: 16, color: color.withOpacity(0.7)),
            const SizedBox(width: 4),
            Text(b, style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 11)),
          ]),
        )),
      ]),
    ),
  );
}
