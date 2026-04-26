import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import '../../core/api/api_client.dart';
import '../auth/auth_provider.dart';
import 'profile_provider.dart';

class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key});
  @override State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<dynamic> _allSkills     = [];
  List<String>  _mySkillIds    = [];
  bool          _loadingSkills = true;
  bool          _saving        = false;
  bool          _addingOther   = false;
  String?       _avatarUrl;
  final _otherSkillCtrl = TextEditingController();

  final _emailCtrl     = TextEditingController();
  final _bioCtrl       = TextEditingController();
  final _locationCtrl  = TextEditingController();
  final _dailyCtrl     = TextEditingController();
  final _hourlyCtrl    = TextEditingController();
  final _mpesaCtrl     = TextEditingController();
  bool  _isAvailable   = true;
  String _skillSearch  = '';
  String _skillCat     = 'all';

  static const _catColors = {
    'sales':'#3B82F6', 'technician':'#F97316', 'logistics':'#0D9488',
    'finance':'#8B5CF6', 'research':'#EC4899', 'merchandising':'#1B6B3A', 'general':'#6B7280',
  };

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _emailCtrl.dispose();
    _bioCtrl.dispose(); _locationCtrl.dispose();
    _dailyCtrl.dispose(); _hourlyCtrl.dispose(); _mpesaCtrl.dispose();
    _otherSkillCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final api = context.read<ApiClient>();
    setState(() => _loadingSkills = true);
    try {
      final results = await Future.wait<dynamic>([
        api.getSkills(),
        api.getMyProfile(),
      ]);
      _allSkills = (results[0] as List?) ?? [];
      final profile = results[1] as Map<String, dynamic>?;
      if (profile != null) {
        _emailCtrl.text = profile['email'] as String? ?? '';
        final wp = await api.getWorkerProfile().catchError((_) => null);
        if (wp != null && mounted) {
          _mySkillIds = (wp['skills'] as List? ?? []).map((s) => s['id'].toString()).toList();
          _bioCtrl.text      = wp['bio'] ?? '';
          _locationCtrl.text = wp['location'] ?? '';
          _dailyCtrl.text    = wp['dailyRate']?.toString() ?? '';
          _hourlyCtrl.text   = wp['hourlyRate']?.toString() ?? '';
          _mpesaCtrl.text    = wp['mpesaPhone'] ?? '';
          _isAvailable       = wp['isAvailable'] ?? true;
          if (wp['avatarUrl'] != null) _avatarUrl = wp['avatarUrl'] as String?;
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingSkills = false);
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    final api = context.read<ApiClient>();
    try {
      await api.updateWorkerProfile({
        'bio':         _bioCtrl.text.trim(),
        'location':    _locationCtrl.text.trim(),
        'dailyRate':   double.tryParse(_dailyCtrl.text),
        'hourlyRate':  double.tryParse(_hourlyCtrl.text),
        'mpesaPhone':  _mpesaCtrl.text.trim(),
        'isAvailable': _isAvailable,
      });

      // If a new email was entered, start the verification flow
      final newEmail = _emailCtrl.text.trim();
      if (newEmail.isNotEmpty) {
        await _requestEmailChange(api, newEmail);
        return; // snackbar / OTP dialog handled inside
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Profile saved!'), backgroundColor: AppColors.primary));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Failed to save'), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _requestEmailChange(ApiClient api, String newEmail) async {
    try {
      await api.requestContactUpdate('email', newEmail);
      if (!mounted) return;
      setState(() => _saving = false);
      _showOtpDialog(api, newEmail);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.toString().contains('already registered')
          ? 'That email is already used by another account.'
          : 'Could not send verification code. Please try again.'),
        backgroundColor: Colors.red));
    }
  }

  void _showOtpDialog(ApiClient api, String newEmail) {
    final codeCtrl = TextEditingController();
    bool submitting = false;
    String? dialogError;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Verify new email', style: TextStyle(fontWeight: FontWeight.w700)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Enter the 6-digit code sent to\n$newEmail',
              style: TextStyle(fontSize: 13, color: context.appText3), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            TextField(
              controller: codeCtrl,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 8),
              decoration: const InputDecoration(
                counterText: '',
                hintText: '······',
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
            if (dialogError != null) ...[
              const SizedBox(height: 10),
              Text(dialogError!, style: const TextStyle(color: Colors.red, fontSize: 12)),
            ],
          ]),
          actions: [
            TextButton(
              onPressed: () { Navigator.pop(ctx); codeCtrl.dispose(); },
              child: const Text('Cancel')),
            ElevatedButton(
              onPressed: submitting ? null : () async {
                if (codeCtrl.text.trim().length != 6) {
                  setDialogState(() => dialogError = 'Enter the full 6-digit code');
                  return;
                }
                setDialogState(() { submitting = true; dialogError = null; });
                try {
                  await api.verifyContactUpdate('email', codeCtrl.text.trim());
                  codeCtrl.dispose();
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('Email updated and verified!'),
                      backgroundColor: AppColors.primary));
                  }
                } catch (_) {
                  setDialogState(() {
                    submitting = false;
                    dialogError = 'Invalid code. Please try again.';
                  });
                }
              },
              child: submitting
                ? const SizedBox(width: 16, height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)))
                : const Text('Verify'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 512, imageQuality: 80);
    if (picked == null || !mounted) return;

    final api = context.read<ApiClient>();
    try {
      // Upload file bytes to MinIO via API, get back URL
      final bytes = await picked.readAsBytes();
      final filename = 'avatar_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final formData = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: filename)});
      final res = await api.uploadAvatar(formData);
      final url = res['url'] ?? res['avatarUrl'];
      if (url != null && mounted) {
        setState(() => _avatarUrl = url);
        await api.updateWorkerProfile({'avatarUrl': url});
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('Profile photo updated!'),
          backgroundColor: AppColors.primary));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Upload failed: $e'),
        backgroundColor: Colors.red));
    }
  }

  Future<void> _saveSkills() async {
    setState(() => _saving = true);
    final api = context.read<ApiClient>();
    try {
      await api.updateSkills(_mySkillIds);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${_mySkillIds.length} skills saved!'),
          backgroundColor: AppColors.primary));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Failed to save skills'), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  Color _catColor(String? cat) {
    final hex = _catColors[cat] ?? '#1B6B3A';
    return Color(int.parse('FF${hex.substring(1)}', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ProfileProvider>();
    final agent   = profile.agent;
    final auth    = context.read<AuthProvider>();

    final completionItems = [
      _bioCtrl.text.isNotEmpty && _locationCtrl.text.isNotEmpty,
      _mySkillIds.isNotEmpty,
      _dailyCtrl.text.isNotEmpty || _hourlyCtrl.text.isNotEmpty,
      _mpesaCtrl.text.isNotEmpty,
    ];
    final pct = (completionItems.where((b) => b).length / completionItems.length * 100).round();

    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      body: NestedScrollView(
        headerSliverBuilder: (ctx, _) => [
          SliverAppBar(
            pinned: true, expandedHeight: 180,
            backgroundColor: AppColors.dark,
            actions: [
              Builder(builder: (ctx) {
                final isDark = ctx.watch<ThemeProvider>().isDark;
                return IconButton(
                  padding: EdgeInsets.zero,
                  iconSize: 18,
                  tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
                  icon: Icon(
                    isDark ? Icons.wb_sunny_rounded : Icons.nightlight_round,
                    color: Colors.white.withValues(alpha: 0.85),
                    size: 18,
                  ),
                  onPressed: () => ctx.read<ThemeProvider>().toggle(),
                );
              }),
              IconButton(
                icon: const Icon(Icons.logout_rounded, color: Colors.white70, size: 20),
                onPressed: () => auth.logout(context),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                color: AppColors.dark,
                padding: const EdgeInsets.fromLTRB(20, 60, 20, 16),
                child: Column(children: [
                  Row(children: [
                    CircleAvatar(radius: 28,
                      backgroundColor: AppColors.primary,
                      child: Text(agent?.initials ?? 'A',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18))),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(agent?.name ?? 'Agent',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                      Text(agent?.user?.roleDisplay ?? 'Field Agent',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
                      const SizedBox(height: 6),
                      Row(children: [
                        _Pill('⭐ Lv ${agent?.level ?? 1}'),
                        const SizedBox(width: 6),
                        _Pill('🔥 ${agent?.currentStreak ?? 0} streak'),
                        const SizedBox(width: 6),
                        _Pill('${agent?.totalXp ?? 0} XP'),
                      ]),
                    ])),
                  ]),
                  const SizedBox(height: 12),
                  // Completion bar
                  Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Text('Profile $pct% complete',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
                        Text(pct == 100 ? 'Complete!' : '${completionItems.where((b) => b).length}/4 steps',
                          style: TextStyle(color: pct == 100 ? AppColors.primaryLight : AppColors.warning, fontSize: 11, fontWeight: FontWeight.w600)),
                      ]),
                      const SizedBox(height: 4),
                      ClipRRect(borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: pct / 100,
                          backgroundColor: Colors.white.withValues(alpha: 0.15),
                          valueColor: AlwaysStoppedAnimation(
                            pct == 100 ? AppColors.primaryLight : AppColors.warning),
                          minHeight: 5)),
                    ])),
                  ]),
                ]),
              ),
            ),
            bottom: TabBar(
              controller: _tabs,
              indicatorColor: AppColors.primaryLight,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white38,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              tabs: [
                const Tab(text: 'Bio & Location'),
                Tab(text: 'Skills (${_mySkillIds.length})'),
                const Tab(text: 'Rates'),
              ],
            ),
          ),
        ],
        body: TabBarView(controller: _tabs, children: [
          _buildBioTab(),
          _buildSkillsTab(),
          _buildRatesTab(),
        ]),
      ),
    );
  }

  Widget _buildBioTab() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(children: [
      // Avatar upload
      GestureDetector(
        onTap: _pickAndUploadAvatar,
        child: Container(
          margin: const EdgeInsets.only(bottom: 16),
          child: Stack(alignment: Alignment.bottomRight, children: [
            CircleAvatar(
              radius: 44,
              backgroundColor: AppColors.primaryPale,
              backgroundImage: _avatarUrl != null ? CachedNetworkImageProvider(_avatarUrl!) : null,
              child: _avatarUrl == null
                ? const Icon(Icons.person_rounded, size: 44, color: AppColors.primary)
                : null),
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2)),
              child: const Icon(Icons.camera_alt_rounded, size: 14, color: Colors.white)),
          ])),
      ),
      _SectionCard(
        title: 'Email address',
        child: TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            hintText: 'you@example.com',
            prefixIcon: Icon(Icons.email_outlined, size: 18),
            border: OutlineInputBorder(),
            contentPadding: EdgeInsets.symmetric(vertical: 12, horizontal: 12)),
          style: const TextStyle(fontSize: 13)),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'About you',
        child: Column(children: [
          TextField(controller: _bioCtrl, maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'e.g. Route sales rep, 3 years FMCG, own motorbike. Strong customer relationships.',
              border: OutlineInputBorder(), contentPadding: EdgeInsets.all(12)),
            style: const TextStyle(fontSize: 13)),
        ]),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'Location',
        child: Column(children: [
          TextField(controller: _locationCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Westlands, Nairobi', prefixIcon: Icon(Icons.location_on, size: 18),
              border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(vertical: 12, horizontal: 12)),
            style: const TextStyle(fontSize: 13)),
        ]),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'M-Pesa payment phone',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextField(controller: _mpesaCtrl, keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              hintText: '0712 345 678', prefixIcon: Icon(Icons.phone_android, size: 18),
              border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(vertical: 12, horizontal: 12)),
            style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 6),
          Text('Managers send payments to this number', style: TextStyle(fontSize: 11, color: context.appText4)),
        ]),
      ),
      const SizedBox(height: 20),
      SizedBox(width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _saving ? null : _saveProfile,
          icon: const Icon(Icons.save, size: 16),
          label: Text(_saving ? 'Saving...' : 'Save profile'),
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        )),
      const SizedBox(height: 20),
      // ── Dispute filing ──────────────────────────────────────
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.appCardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.appBorderColor, width: 0.5)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('SUPPORT & DISPUTES',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
              color: context.appText3, letterSpacing: 0.4)),
          const SizedBox(height: 10),
          Text(
            'Have an issue with a payment, job, or another user? File a dispute and our team will review within 72 hours.',
            style: TextStyle(fontSize: 12, color: context.appText3, height: 1.5)),
          const SizedBox(height: 12),
          SizedBox(width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _openFileDisputeSheet,
              icon: const Icon(Icons.gavel_rounded, size: 16),
              label: const Text('File a Dispute'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                padding: const EdgeInsets.symmetric(vertical: 12)),
            )),
        ]),
      ),
      const SizedBox(height: 20),
    ]),
  );

  Widget _buildSkillsTab() {
    if (_loadingSkills) return const Center(child: CircularProgressIndicator());

    final cats = ['all', ...{..._allSkills.map((s) => s['category']?.toString() ?? 'general')}];
    final filtered = _allSkills.where((s) {
      final matchCat = _skillCat == 'all' || s['category'] == _skillCat;
      final matchQ   = _skillSearch.isEmpty || (s['name'] as String).toLowerCase().contains(_skillSearch.toLowerCase());
      return matchCat && matchQ;
    }).toList();

    // Selected skills
    final mySkills = _allSkills.where((s) => _mySkillIds.contains(s['id'])).toList();

    return Column(children: [
      if (mySkills.isNotEmpty)
        Container(
          width: double.infinity, padding: const EdgeInsets.all(12),
          color: AppColors.primaryPale,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Your skills (${mySkills.length})',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: mySkills.map((s) {
              final color = _catColor(s['category']);
              return GestureDetector(
                onTap: () => setState(() => _mySkillIds.remove(s['id'])),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(10, 4, 6, 4),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: color.withValues(alpha: 0.4))),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(s['name'] as String, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
                    const SizedBox(width: 4),
                    Icon(Icons.close, size: 12, color: color),
                  ]),
                ),
              );
            }).toList()),
          ]),
        ),

      // Search + category filter
      Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          TextField(
            onChanged: (v) => setState(() => _skillSearch = v),
            decoration: const InputDecoration(
              hintText: 'Search skills...', prefixIcon: Icon(Icons.search, size: 18),
              border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              isDense: true),
            style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 8),
          SingleChildScrollView(scrollDirection: Axis.horizontal,
            child: Row(children: cats.map((c) {
              final active = _skillCat == c;
              return GestureDetector(
                onTap: () => setState(() => _skillCat = c),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : context.appCardColor,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: active ? AppColors.primary : context.appBorderColor)),
                  child: Text(c == 'all' ? 'All' : c,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                      color: active ? Colors.white : context.appText2)),
                ),
              );
            }).toList()),
          ),
        ]),
      ),

      // Skills grid
      Expanded(child: GridView.builder(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 80),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2, crossAxisSpacing: 8, mainAxisSpacing: 8, childAspectRatio: 2.8),
        itemCount: filtered.length,
        itemBuilder: (_, i) {
          final s        = filtered[i];
          final selected = _mySkillIds.contains(s['id']);
          final color    = _catColor(s['category']);
          return GestureDetector(
            onTap: () => setState(() {
              if (selected) _mySkillIds.remove(s['id']);
              else _mySkillIds.add(s['id'].toString());
            }),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: selected ? color.withValues(alpha: 0.1) : context.appCardColor,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: selected ? color : context.appBorderColor, width: selected ? 1.5 : 0.5)),
              child: Row(children: [
                Container(width: 22, height: 22, decoration: BoxDecoration(
                  color: selected ? color : context.appSurfaceColor, borderRadius: BorderRadius.circular(6)),
                  child: selected ? Icon(Icons.check, size: 13, color: Colors.white) : null),
                const SizedBox(width: 8),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(s['name'] as String,
                    style: TextStyle(fontSize: 11, fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? color : context.appText1),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(s['category'] as String,
                    style: TextStyle(fontSize: 9, color: context.appText4)),
                ])),
              ]),
            ),
          );
        },
      )),

      // Add "Other" custom skill
      Container(
        margin: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(color: context.appSurfaceColor, borderRadius: BorderRadius.circular(8)),
        child: _addingOther
          ? Padding(
              padding: const EdgeInsets.all(10),
              child: Row(children: [
                Expanded(child: TextField(
                  controller: _otherSkillCtrl, autofocus: true,
                  style: const TextStyle(fontSize: 13),
                  decoration: InputDecoration(
                    hintText: 'Custom skill name...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)))),
                const SizedBox(width: 8),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  onPressed: () async {
                    final name = _otherSkillCtrl.text.trim();
                    if (name.isEmpty) return;
                    final api = context.read<ApiClient>();
                    try {
                      final newSkill = await api.createOrFindSkill(name, 'general');
                      final skillId = newSkill['id']?.toString();
                      if (skillId != null && mounted) {
                        setState(() {
                          if (!_mySkillIds.contains(skillId)) _mySkillIds.add(skillId);
                          if (!_allSkills.any((s) => s['id'] == skillId)) _allSkills.add(newSkill);
                          _addingOther = false;
                          _otherSkillCtrl.clear();
                        });
                      }
                    } catch (_) { if (mounted) setState(() => _addingOther = false); }
                  },
                  child: const Text('Add')),
                TextButton(onPressed: () => setState(() { _addingOther = false; _otherSkillCtrl.clear(); }),
                  child: const Text('Cancel')),
              ]))
          : ListTile(
              dense: true, leading: const Icon(Icons.add_circle_outline, color: AppColors.primary, size: 20),
              title: const Text('Add custom skill (Other)', style: TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600)),
              onTap: () => setState(() => _addingOther = true)),
      ),
      const SizedBox(height: 8),

      // Save button
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: SafeArea(
          child: SizedBox(width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _saveSkills,
              icon: const Icon(Icons.save, size: 16),
              label: Text(_saving ? 'Saving...' : 'Save ${_mySkillIds.length} skills'),
              style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
            )),
        ),
      ),
    ]);
  }

  void _openFileDisputeSheet() {
    final descCtrl    = TextEditingController();
    final againstCtrl = TextEditingController();
    final amountCtrl  = TextEditingController();
    String? selectedType;
    bool submitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          Future<void> submit() async {
            if (selectedType == null) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content: Text('Please select a dispute type')));
              return;
            }
            if (descCtrl.text.trim().isEmpty) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content: Text('Please describe the issue')));
              return;
            }
            if (againstCtrl.text.trim().isEmpty) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content: Text('Please enter the other party\'s User ID')));
              return;
            }
            setSheetState(() => submitting = true);
            try {
              await context.read<ApiClient>().fileDispute(
                type: selectedType!,
                description: descCtrl.text.trim(),
                againstUserId: againstCtrl.text.trim(),
                amountKes: amountCtrl.text.isNotEmpty ? double.tryParse(amountCtrl.text) : null,
              );
              if (ctx.mounted) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Dispute filed — our team will review within 72 hours'),
                  backgroundColor: Color(0xFF1B6B3A)));
              }
            } catch (e) {
              setSheetState(() => submitting = false);
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(content: Text('Failed to file dispute: $e')));
            }
          }

          return Padding(
            padding: EdgeInsets.only(
              left: 20, right: 20, top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: SingleChildScrollView(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('File a Dispute',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(ctx)),
                ]),
                Text('Our team reviews within 72 hours',
                  style: TextStyle(fontSize: 12, color: context.appText3)),
                const SizedBox(height: 16),

                Text('DISPUTE TYPE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: context.appText3)),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  hint: const Text('Select type…', style: TextStyle(fontSize: 13)),
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    isDense: true),
                  items: const [
                    DropdownMenuItem(value: 'payment',      child: Text('💰 Payment — wrong amount / not released')),
                    DropdownMenuItem(value: 'quality',      child: Text('⭐ Quality — work was substandard')),
                    DropdownMenuItem(value: 'non_delivery', child: Text('📦 Non-Delivery — job not completed')),
                    DropdownMenuItem(value: 'fraud',        child: Text('🚨 Fraud — suspected fraudulent activity')),
                    DropdownMenuItem(value: 'harassment',   child: Text('🚫 Harassment — conduct issues')),
                    DropdownMenuItem(value: 'other',        child: Text('❓ Other')),
                  ],
                  onChanged: (v) => setSheetState(() => selectedType = v),
                ),
                const SizedBox(height: 12),

                Text('OTHER PARTY USER ID', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: context.appText3)),
                const SizedBox(height: 6),
                TextField(
                  controller: againstCtrl,
                  decoration: const InputDecoration(
                    hintText: 'Paste the user ID of the other party',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    isDense: true),
                  style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),

                Text('AMOUNT IN DISPUTE (KES) — optional', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: context.appText3)),
                const SizedBox(height: 6),
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    hintText: 'e.g. 3500',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    isDense: true),
                  style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),

                Text('DESCRIPTION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: context.appText3)),
                const SizedBox(height: 6),
                TextField(
                  controller: descCtrl,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    hintText: 'Describe what happened — include dates, job IDs, and any evidence…',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    isDense: true),
                  style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 20),

                SizedBox(width: double.infinity,
                  child: ElevatedButton(
                    onPressed: submitting ? null : submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: Text(submitting ? 'Submitting…' : 'Submit Dispute',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  )),
              ]),
            ),
          );
        },
      ),
    );
  }

  Widget _buildRatesTab() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(children: [
      _SectionCard(
        title: 'Your rates',
        child: Column(children: [
          Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Daily rate (KES)', style: TextStyle(fontSize: 11, color: context.appText3, fontWeight: FontWeight.w600)),
              const SizedBox(height: 5),
              TextField(controller: _dailyCtrl, keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '1500', border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10), isDense: true),
                style: const TextStyle(fontSize: 13)),
            ])),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Hourly rate (KES)', style: TextStyle(fontSize: 11, color: context.appText3, fontWeight: FontWeight.w600)),
              const SizedBox(height: 5),
              TextField(controller: _hourlyCtrl, keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '250', border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10), isDense: true),
                style: const TextStyle(fontSize: 13)),
            ])),
          ]),
        ]),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'Availability',
        child: Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Available for work', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              Text('Employers can find and contact you', style: TextStyle(fontSize: 12, color: context.appText4)),
            ]),
            Switch(value: _isAvailable, activeThumbColor: AppColors.primary,
              onChanged: (v) => setState(() => _isAvailable = v)),
          ]),
        ]),
      ),
      const SizedBox(height: 20),
      Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFCD34D))),
        child: const Row(children: [
          Text('💡', style: TextStyle(fontSize: 16)),
          SizedBox(width: 10),
          Expanded(child: Text(
            'Workers with complete profiles get 3× more employer views',
            style: TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.5))),
        ])),
      const SizedBox(height: 20),
      SizedBox(width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _saving ? null : _saveProfile,
          icon: const Icon(Icons.save, size: 16),
          label: Text(_saving ? 'Saving...' : 'Save rates'),
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        )),
    ]),
  );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity, padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: context.appCardColor, borderRadius: BorderRadius.circular(12),
      border: Border.all(color: context.appBorderColor, width: 0.5)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
        color: context.appText3, letterSpacing: 0.4, height: 1)),
      const SizedBox(height: 10),
      child,
    ]),
  );
}

class _Pill extends StatelessWidget {
  final String label;
  const _Pill(this.label);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(99)),
    child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
  );
}
